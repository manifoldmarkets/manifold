import { sortBy, sum } from 'lodash'
import { Answer } from './answer'
import { MAX_CPMM_PROB, MIN_CPMM_PROB } from './contract'
import { NFL_TEAM_TLA } from './sports'
import {
  CLOSE_BUFFER_HOURS,
  SPORT_ID_TO_SPORT_KEY,
  SPORT_LEAGUE_LABEL,
  SportsCalendarEntry,
} from './sports-calendar'

// ─── The Odds API: pure helpers ───────────────────────────────────────────────
//
// Everything about an Odds API game market that does not need the network or
// the database: the response shapes, the odds maths, the event id format, and
// the market a game turns into. The backend does the fetching and inserting.

export interface OddsApiEvent {
  id: string
  sport_key: string
  sport_title: string
  /** ISO 8601 */
  commence_time: string
  home_team: string
  away_team: string
  bookmakers: OddsApiBookmaker[]
}

export interface OddsApiBookmaker {
  key: string
  title: string
  last_update: string
  markets: OddsApiMarket[]
}

export interface OddsApiMarket {
  key: 'h2h' | 'spreads' | 'totals'
  last_update: string
  outcomes: OddsApiOutcome[]
}

export interface OddsApiOutcome {
  name: string
  /** American odds, e.g. -150 or +130 */
  price: number
}

export interface OddsApiScore {
  id: string
  sport_key: string
  sport_title: string
  commence_time: string
  completed: boolean
  home_team: string
  away_team: string
  scores: Array<{ name: string; score: string }> | null
  last_update: string | null
}

// ─── Event ids ────────────────────────────────────────────────────────────────
//
// `sportsEventId` on a contract is `odds:<sport key>:<event id>`, so the
// resolver can tell which sport to poll from the field alone and every market
// about the game (lines, props) can carry the same id.

const ODDS_EVENT_PREFIX = 'odds:'

export function oddsEventId(sportKey: string, eventId: string): string {
  return `${ODDS_EVENT_PREFIX}${sportKey}:${eventId}`
}

export function parseOddsEventId(
  id: string | null | undefined
): { sportKey: string; eventId: string } | null {
  if (!id || !id.startsWith(ODDS_EVENT_PREFIX)) return null
  const rest = id.slice(ODDS_EVENT_PREFIX.length)
  const i = rest.indexOf(':')
  if (i <= 0 || i === rest.length - 1) return null
  return { sportKey: rest.slice(0, i), eventId: rest.slice(i + 1) }
}

// ─── Odds maths ───────────────────────────────────────────────────────────────

/** American odds to raw implied probability (before removing the vig). */
export function americanOddsToProb(price: number): number {
  if (price > 0) return 100 / (price + 100)
  return Math.abs(price) / (Math.abs(price) + 100)
}

/**
 * Fair probabilities for `outcomes`, in that order, from every bookmaker whose
 * h2h market quotes all of them: each book's implied probabilities divided by
 * its overround, averaged across those books, then rescaled to sum to one and
 * kept inside the range an answer can trade at. Taking every outcome from the
 * same books is what makes a three-way line add up. Null without such a book.
 */
export function fairProbs(
  event: OddsApiEvent,
  outcomes: string[]
): number[] | null {
  const perBook = event.bookmakers.flatMap((b) =>
    b.markets
      .filter((m) => m.key === 'h2h')
      .flatMap((market) => {
        const prices = outcomes.map(
          (name) => market.outcomes.find((o) => o.name === name)?.price
        )
        if (prices.some((price) => price === undefined)) return []
        const totalRaw = sum(
          market.outcomes.map((o) => americanOddsToProb(o.price))
        )
        if (!(totalRaw > 0)) return []
        return [prices.map((price) => americanOddsToProb(price!) / totalRaw)]
      })
  )
  if (perBook.length === 0) return null
  const avg = outcomes.map(
    (_, i) => sum(perBook.map((p) => p[i])) / perBook.length
  )
  return fitProbs(avg, MIN_CPMM_PROB, MAX_CPMM_PROB)
}

/**
 * Rescale `probs` to sum to one with every value inside [min, max]. Values
 * outside the range are pinned to it and the rest share what is left, repeated
 * because rescaling can push another value out.
 */
export function fitProbs(probs: number[], min: number, max: number): number[] {
  const n = probs.length
  // Everyone else needs at least `min`, which caps the favourite below `max`.
  const top = Math.min(max, 1 - (n - 1) * min)
  const total = sum(probs)
  let p = probs.map((x) => (total > 0 ? x / total : 1 / n))
  for (let round = 0; round < n; round++) {
    const pinned = p.map((x) => (x < min ? min : x > top ? top : undefined))
    if (pinned.every((x) => x === undefined)) break
    const freeTotal = sum(p.filter((_, i) => pinned[i] === undefined))
    const freeCount = pinned.filter((x) => x === undefined).length
    const left = 1 - sum(pinned.filter((x): x is number => x !== undefined))
    p = p.map(
      (x, i) =>
        pinned[i] ?? (freeTotal > 0 ? (x / freeTotal) * left : left / freeCount)
    )
  }
  return p
}

/** Home and away scores from a score payload, matched by team name. */
export function teamScores(score: OddsApiScore): {
  home: number | null
  away: number | null
} {
  const find = (name: string) => {
    const raw = score.scores?.find((s) => s.name === name)?.score
    const n = raw == null ? NaN : parseInt(raw, 10)
    return isNaN(n) ? null : n
  }
  return { home: find(score.home_team), away: find(score.away_team) }
}

/**
 * Which side won a completed game, 'tie' if it ended level, null if it isn't
 * over or the scores aren't usable. Sides come from the scores payload's own
 * home/away fields, so no team name has to match across endpoints.
 */
export function winningSide(
  score: OddsApiScore
): 'home' | 'away' | 'tie' | null {
  if (!score.completed) return null
  const { home, away } = teamScores(score)
  if (home == null || away == null) return null
  return home > away ? 'home' : away > home ? 'away' : 'tie'
}

// ─── The market a game becomes ────────────────────────────────────────────────

export const DRAW_ANSWER = 'Draw'

/**
 * How a finished game market resolves: the winning team's answer, Draw when a
 * three-way game ends level, or 50/50 between the teams when a game without a
 * Draw answer ends level. Team answers are found by name, falling back to
 * position (home first), so a renamed answer still resolves. Null if the
 * answers don't look like a game.
 */
export function gameResolution(
  answers: Pick<Answer, 'id' | 'text' | 'index'>[],
  side: 'home' | 'away' | 'tie',
  homeTeam?: string,
  awayTeam?: string
): { outcome: string; resolutions: Record<string, number> } | null {
  const norm = (text: string) => text.trim().toLowerCase()
  const draw = answers.find((a) =>
    [norm(DRAW_ANSWER), 'tie'].includes(norm(a.text))
  )
  const teams = sortBy(
    answers.filter((a) => a !== draw),
    (a) => a.index
  )
  if (teams.length !== 2) return null
  const named = (name: string | undefined) =>
    name ? teams.find((a) => norm(a.text) === norm(name)) : undefined
  const awayByName = named(awayTeam)
  const home =
    named(homeTeam) ??
    (awayByName ? teams.find((a) => a !== awayByName)! : teams[0])
  const away = teams.find((a) => a !== home)!
  if (side === 'tie') {
    if (draw) return { outcome: draw.id, resolutions: { [draw.id]: 100 } }
    return {
      outcome: 'CHOOSE_MULTIPLE',
      resolutions: { [home.id]: 50, [away.id]: 50 },
    }
  }
  const winner = side === 'home' ? home : away
  return { outcome: winner.id, resolutions: { [winner.id]: 100 } }
}

/** Soccer draws are common enough to deserve their own answer; elsewhere a tie resolves 50/50. */
export function isThreeWay(
  entry: Pick<SportsCalendarEntry, 'sport' | 'tiesAllowed'>
): boolean {
  return entry.tiesAllowed ?? entry.sport === 'soccer'
}

export interface OddsMarketParams {
  outcomeType: 'MULTIPLE_CHOICE'
  question: string
  /** Markdown */
  description: string
  /**
   * Home first, then away, then Draw where the sport allows one. The schedule
   * reads the first answer as the home team.
   */
  answers: string[]
  /**
   * Opening probability of each answer as a percent, from the devigged
   * moneyline. Undefined without a line: the answers then open level.
   */
  answerProbs?: number[]
  answerShortTexts?: string[]
  closeTime: number
  sportsEventId: string
  sportsStartTimestamp: string
  sportsLeague: string
  sportsHomeTeam: string
  sportsAwayTeam: string
  sportsMarketType: 'moneyline'
}

/**
 * Every game becomes a multiple-choice market that sums to one: a versus
 * market (home, away) where a tie is rare and resolves 50/50, or home, away,
 * Draw for soccer. Answers open at the bookmakers' consensus.
 */
export function buildOddsMarketParams(
  event: OddsApiEvent,
  entry: Pick<SportsCalendarEntry, 'sport' | 'competition' | 'tiesAllowed'>
): OddsMarketParams {
  const threeWay = isThreeWay(entry)
  const date = new Date(event.commence_time).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  })
  const home = event.home_team
  const away = event.away_team
  const answers = threeWay ? [home, away, DRAW_ANSWER] : [home, away]
  // Percent, unrounded: rounding can push a pinned 1% answer under the
  // floor once the pools rescale the total to exactly 100.
  const answerProbs = fairProbs(event, answers)?.map((p) => p * 100)

  const homeShort = NFL_TEAM_TLA[home]
  const awayShort = NFL_TEAM_TLA[away]
  const answerShortTexts =
    homeShort && awayShort
      ? threeWay
        ? [homeShort, awayShort, DRAW_ANSWER]
        : [homeShort, awayShort]
      : undefined

  // The date tells repeat fixtures apart (series, rematches).
  const question = threeWay
    ? `${home} vs ${away}, ${date} [official]`
    : `${away} at ${home}, ${date} [official]`

  const sportParam = SPORT_ID_TO_SPORT_KEY[entry.sport]
  const manifoldSportsLink =
    '[@ManifoldSports](https://manifold.markets/ManifoldSports)'
  const description = threeWay
    ? [
        `**${home} vs ${away}**`,
        ``,
        `Market auto-resolves to the winner, or to Draw if the match is level after 90 minutes plus stoppage time.`,
        `Resolves N/A if the match is cancelled or postponed indefinitely.`,
        ``,
        `Created and resolved automatically by ${manifoldSportsLink}.`,
        ``,
        `[See all markets on Manifold Sports](/sports?sport=${sportParam})`,
      ].join('\n')
    : [
        `**${away} at ${home}**`,
        ``,
        `Market auto-resolves to the winner.`,
        `If the game ends in a tie, it resolves 50/50 between the two teams.`,
        `Resolves N/A if the game is cancelled or postponed indefinitely.`,
        ``,
        `Created and resolved automatically by ${manifoldSportsLink}.`,
        ``,
        `[See all markets on Manifold Sports](/sports?sport=${sportParam})`,
      ].join('\n')

  const closeTime =
    new Date(event.commence_time).getTime() +
    CLOSE_BUFFER_HOURS[entry.sport] * 60 * 60 * 1000

  return {
    outcomeType: 'MULTIPLE_CHOICE',
    question,
    description,
    answers,
    answerProbs,
    answerShortTexts,
    closeTime,
    sportsEventId: oddsEventId(event.sport_key, event.id),
    sportsStartTimestamp: event.commence_time,
    sportsLeague: SPORT_LEAGUE_LABEL[entry.sport],
    sportsHomeTeam: home,
    sportsAwayTeam: away,
    sportsMarketType: 'moneyline',
  }
}
