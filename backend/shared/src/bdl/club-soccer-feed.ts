import { chunk, isEqual } from 'lodash'
import { bdlEventId } from 'common/sports-ids'
import { BDL_LEAGUES } from 'common/bdl/leagues'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import type { ProviderOdds } from 'common/sports-provider'
import type { createBdlClient } from '../balldontlie-client'
import {
  ClubLeague,
  ClubMatch,
  clubRow,
  clubTime,
  decodeClubOdds,
  decodeClubSlate,
  isClubPregameAt,
} from './club-soccer'

type Client = Pick<ReturnType<typeof createBdlClient>, 'get' | 'getAll'>

/** A disabled read has no snapshot. Callers must not infer vanished matches from a disabled league. */
export async function readClubSlate(
  client: Client,
  options: {
    league: ClubLeague
    season: number
    dates: readonly string[]
    enabled?: boolean
  }
) {
  const { league, season, dates, enabled } = options
  if (!enabled || !isSportsBdlEnabled()) return null
  if (
    !Number.isSafeInteger(season) ||
    season < 1 ||
    dates.length === 0 ||
    dates.some(
      (day) =>
        !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !Number.isFinite(clubTime(day + 'T00:00:00Z'))
    )
  )
    throw new Error('Invalid club soccer season or match dates')
  const apiBase = BDL_LEAGUES[league].apiBase
  const teamsPage = await client.get(apiBase + '/teams', { season })
  const directory = clubRow(teamsPage.body)
  if (
    !Array.isArray(directory.data) ||
    clubRow(directory.meta).next_cursor != null
  )
    throw new Error('Incomplete club soccer team directory')
  const requestedDates = new Set(dates)
  const rows: unknown[] = []
  const seenInBatch = new Set<number>()
  let wrongBatch = false
  for (const days of chunk([...requestedDates], 14)) {
    const page = await client.getAll<unknown>(
      apiBase + '/matches',
      { season, dates: days },
      { maxPages: 50, matches: () => true }
    )
    // Keep even the misplaced versions until duplicate identities are checked.
    for (const raw of page) {
      const r = clubRow(raw)
      const start = clubTime(r.date)
      if (
        Number.isFinite(start) &&
        !days.includes(new Date(start).toISOString().slice(0, 10))
      )
        wrongBatch = true
      else if (typeof r.id === 'number') seenInBatch.add(r.id)
      rows.push(raw)
    }
  }
  const slate = decodeClubSlate(
    league,
    season,
    directory.data,
    rows,
    requestedDates
  )
  if (wrongBatch) {
    slate.incomplete = true
    for (const m of slate.matches) {
      if (seenInBatch.has(m.id) || m.hold) continue
      m.hold = 'invalid-schedule'
      m.regulationResult = null
    }
  }
  return slate
}

export async function readClubOdds(
  client: Client,
  league: ClubLeague,
  matches: readonly ClubMatch[],
  enabled = false,
  clock: () => number = Date.now
) {
  if (!enabled || !isSportsBdlEnabled()) return null
  let observedAt = clock()
  let clockValid = Number.isFinite(observedAt)
  const sampleTime = () => {
    const current = clock()
    if (!Number.isFinite(current) || current < observedAt) clockValid = false
    observedAt = current
    return current
  }

  // A later held or differently oriented copy also disqualifies the ID.
  // Resolve duplicates before filtering for scheduled rows and before chunking.
  const unique = new Map<number, ClubMatch | null>()
  for (const match of matches) {
    const previous = unique.get(match.id)
    if (previous === undefined) unique.set(match.id, match)
    else if (previous && !isEqual(previous, match)) unique.set(match.id, null)
  }
  const eligible = [...unique.values()].filter(
    (m): m is ClubMatch =>
      !!m &&
      isClubPregameAt(m, observedAt) &&
      m.eventId === bdlEventId(league, m.id)
  )
  const empty = new Map<number, ProviderOdds[]>(eligible.map((m) => [m.id, []]))
  const quotes = new Map(empty)
  for (const batch of chunk(eligible, 50)) {
    const startedAt = sampleTime()
    if (!clockValid) return empty
    const current = batch.filter((m) => isClubPregameAt(m, startedAt))
    const ids = new Set(current.map((m) => m.id))
    if (!ids.size) continue
    const receipts: number[] = []
    const rows = await client.getAll<unknown>(
      BDL_LEAGUES[league].oddsApiBase + '/odds',
      { match_ids: [...ids] },
      {
        maxPages: 20,
        matches: (raw) => {
          const id = clubRow(raw).match_id
          return typeof id === 'number' && ids.has(id)
        },
      },
      {
        now: sampleTime,
        onPage: (page, receivedAt) => {
          for (let i = 0; i < page.length; i++) receipts.push(receivedAt)
        },
      }
    )
    if (!clockValid) return empty
    if (rows.length !== receipts.length) continue
    for (const [id, currentQuotes] of decodeClubOdds(current, rows, receipts)) {
      quotes.set(id, currentQuotes)
    }
  }
  // A later request can cross another game's kickoff or invalidate the whole clock.
  const returnedAt = sampleTime()
  if (!clockValid) return empty
  for (const m of eligible) {
    if (!isClubPregameAt(m, returnedAt)) quotes.set(m.id, [])
  }
  return quotes
}
