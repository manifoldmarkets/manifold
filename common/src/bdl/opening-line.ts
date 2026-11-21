import { sum } from 'lodash'
import { MAX_CPMM_PROB, MIN_CPMM_PROB } from '../contract'
import {
  americanOddsToProb,
  fitProbs,
  isValidAmericanOdds,
} from '../odds-markets'
import type { SportsOpeningLine } from '../sports-kickoff-interface'
import type { ProviderOdds } from '../sports-provider'
import { DAY_MS } from '../util/time'
import {
  BDL_EXCHANGE_BOOKS_BAND,
  BDL_EXCHANGE_OVERROUND,
  BDL_ODDS_MAX_AGE_MS,
  BDL_PLACEHOLDER_ABS_MONEYLINE,
} from './constants'
import { BDL_LEAGUES, BdlLeagueKey } from './leagues'

export type OpeningLineGame = {
  eventId: string
  league: BdlLeagueKey
  /** Contract answer order: away/home, home/away for soccer, or entrant one/two. */
  entrantIds: readonly [string, string]
}

const exchanges = ['polymarket', 'kalshi'] as const
const isExchange = (vendor: string) =>
  vendor === 'polymarket' || vendor === 'kalshi'

// Keep the most recent observation even when one of its prices is missing.
// Falling back to an older complete row would resurrect a withdrawn quote.
function latestQuotes(
  rows: readonly ProviderOdds[],
  eventId: string,
  now: number
) {
  const latest = new Map<string, ProviderOdds[]>()
  for (const row of rows) {
    const vendor = row.vendor.trim().toLowerCase()
    const age = now - row.updatedAtMs
    if (
      !vendor ||
      row.eventId !== eventId ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > BDL_ODDS_MAX_AGE_MS
    )
      continue
    const prior = latest.get(vendor)
    if (!prior || row.updatedAtMs > prior[0].updatedAtMs) {
      latest.set(vendor, [row])
    } else if (row.updatedAtMs === prior[0].updatedAtMs) {
      prior.push(row)
    }
  }
  return latest
}

function orderedOdds(
  row: ProviderOdds,
  game: OpeningLineGame,
  withDraw: boolean
) {
  if (row.outcomes.length !== (withDraw ? 3 : 2)) return null
  const prices = game.entrantIds.map(
    (id) =>
      row.outcomes.find(
        ({ outcome }) => outcome !== 'draw' && outcome.entrantId === id
      )?.americanOdds
  )
  if (withDraw)
    prices.push(
      row.outcomes.find(({ outcome }) => outcome === 'draw')?.americanOdds
    )
  return prices.every(isValidAmericanOdds) ? prices : null
}

function fairQuote(
  rows: ProviderOdds[],
  game: OpeningLineGame,
  exchange: boolean,
  withDraw: boolean
) {
  const prices = orderedOdds(rows[0], game, withDraw)
  if (!prices) return null
  // Conflicting observations at an identical timestamp have no reliable ordering.
  if (
    rows.slice(1).some((row) => {
      const other = orderedOdds(row, game, withDraw)
      return !other || prices.some((value, i) => value !== other[i])
    })
  )
    return null
  const raw = prices.map(americanOddsToProb)
  const overround = sum(raw)
  if (
    exchange &&
    (prices.every(
      (price) => Math.abs(price) === BDL_PLACEHOLDER_ABS_MONEYLINE
    ) ||
      overround < BDL_EXCHANGE_OVERROUND.min ||
      overround > BDL_EXCHANGE_OVERROUND.max)
  )
    return null
  return raw.map((p) => p / overround)
}

/** Price a game's quoted outcomes from current BDL odds. Only price contributors are listed in vendors. */
export function selectOpeningLine(
  rows: readonly ProviderOdds[],
  game: OpeningLineGame,
  now: number
): SportsOpeningLine {
  if (!Number.isFinite(now))
    throw new RangeError('Invalid opening line sample time')
  const none: SportsOpeningLine = {
    source: 'none',
    probs: [],
    bookCount: 0,
    vendors: [],
    sampledTime: now,
  }
  const { archetype, oddsQuery } = BDL_LEAGUES[game.league]
  if (
    !oddsQuery ||
    archetype === 'field' ||
    !game.eventId ||
    !game.entrantIds.every((id) => id.trim()) ||
    game.entrantIds[0] === game.entrantIds[1]
  )
    return none
  const quotes = new Map<string, number[]>()
  const books: string[] = []
  for (const [vendor, snapshots] of latestQuotes(rows, game.eventId, now)) {
    const probs = fairQuote(
      snapshots,
      game,
      isExchange(vendor),
      archetype === 'team-3way'
    )
    if (!probs) continue
    quotes.set(vendor, probs)
    if (!isExchange(vendor)) books.push(vendor)
  }
  books.sort()
  const consensus = books.length
    ? quotes
        .get(books[0])!
        .map(
          (_, i) =>
            sum(books.map((vendor) => quotes.get(vendor)![i])) / books.length
        )
    : null
  for (const source of exchanges) {
    const probs = quotes.get(source)
    if (!probs) continue
    if (
      consensus &&
      probs.some(
        (p, i) =>
          Math.abs(p - consensus[i]) > BDL_EXCHANGE_BOOKS_BAND + Number.EPSILON
      )
    )
      continue
    return {
      source,
      probs: fitProbs(probs, MIN_CPMM_PROB, MAX_CPMM_PROB),
      bookCount: books.length,
      vendors: [source],
      sampledTime: now,
    }
  }
  return consensus
    ? {
        source: 'books',
        probs: fitProbs(consensus, MIN_CPMM_PROB, MAX_CPMM_PROB),
        bookCount: books.length,
        vendors: books,
        sampledTime: now,
      }
    : none
}

type ScheduledGame = {
  eventId: string
  startTimeMs: number
  homeTeam: string
  awayTeam: string
}
type MissingPolymarketTeam = {
  league: BdlLeagueKey
  eventId: string
  homeTeam: string
  awayTeam: string
}

/** Call with a complete league/date slate, including scheduled games with zero odds rows. */
export function reportMissingPolymarketTeams(
  league: BdlLeagueKey,
  games: readonly ScheduledGame[],
  rows: readonly ProviderOdds[],
  now: number,
  log: (event: 'pm_missing_for_team', details: MissingPolymarketTeam) => void
) {
  const listed = new Set(
    rows
      .filter((row) => row.vendor.trim().toLowerCase() === 'polymarket')
      .map((row) => row.eventId)
  )
  const pricedGames = games.filter((game) => listed.has(game.eventId)).length
  if (pricedGames <= games.length / 2) return
  for (const { eventId, startTimeMs, homeTeam, awayTeam } of games) {
    const leadMs = startTimeMs - now
    if (
      !listed.has(eventId) &&
      leadMs > 0 &&
      leadMs <= BDL_LEAGUES[league].maxLeadDays * DAY_MS
    )
      log('pm_missing_for_team', { league, eventId, homeTeam, awayTeam })
  }
}
