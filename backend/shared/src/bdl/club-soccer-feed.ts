import { chunk } from 'lodash'
import { bdlEventId } from 'common/sports-ids'
import { BDL_LEAGUES } from 'common/bdl/leagues'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import type { createBdlClient } from '../balldontlie-client'
import {
  ClubLeague,
  ClubMatch,
  clubRow,
  clubTime,
  decodeClubOdds,
  decodeClubSlate,
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
  for (const days of chunk([...requestedDates], 14)) {
    // The decoder retains identifiable malformed matches and reports incomplete coverage.
    rows.push(
      ...(await client.getAll<unknown>(
        apiBase + '/matches',
        { season, dates: days },
        { maxPages: 50, matches: () => true }
      ))
    )
  }
  return decodeClubSlate(league, season, directory.data, rows, requestedDates)
}

export async function readClubOdds(
  client: Client,
  league: ClubLeague,
  matches: readonly ClubMatch[],
  enabled = false
) {
  if (!enabled || !isSportsBdlEnabled()) return null
  const eligible = matches.filter(
    (m) =>
      !m.hold &&
      m.status === 'scheduled' &&
      m.eventId === bdlEventId(league, m.id)
  )
  const rows: unknown[] = []
  for (const batch of chunk(eligible, 50)) {
    const ids = new Set(batch.map((m) => m.id))
    rows.push(
      ...(await client.getAll<unknown>(
        BDL_LEAGUES[league].oddsApiBase + '/odds',
        { match_ids: [...ids] },
        {
          maxPages: 20,
          matches: (raw) => {
            const id = clubRow(raw).match_id
            return typeof id === 'number' && ids.has(id)
          },
        }
      ))
    )
  }
  return decodeClubOdds(eligible, rows)
}
