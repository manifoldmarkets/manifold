import { APIError } from 'common/api/utils'
import { getApproximateSeasonDates } from 'common/leagues'
import { convertLeague } from 'common/supabase/leagues'
import { type SupabaseClient, run } from 'common/supabase/utils'
import { log } from '../utils' // Assuming log exists
import { createSupabaseDirectClient, SupabaseDirectClient } from './init'

export async function getLeaguesForUser(
  db: SupabaseClient,
  filters: {
    userId?: string
    cohort?: string
    season?: number
  }
) {
  const { userId, cohort, season } = filters

  if (!userId && !season && !cohort)
    throw new APIError(400, 'Must provide userId, season, or cohort')

  let q = db
    .from('leagues')
    .select()
    .order('created_time', { ascending: false } as any)

  if (userId) q = q.eq('user_id', userId)
  if (cohort) q = q.eq('cohort', cohort)
  if (season) q = q.eq('season', season)

  const res = await run(q)
  return res.data.map(convertLeague)
}

export type SeasonStatus = 'active' | 'processing' | 'complete'

export type SeasonEndTimeInfo = {
  season: number
  end_time: number
  status: SeasonStatus
}

export const getSeasonEndTimeRow = async (
  pg: SupabaseDirectClient,
  season: number
): Promise<SeasonEndTimeInfo | null> => {
  const row = await pg.oneOrNone(
    `SELECT season, ts_to_millis(end_time) as end_time, status
     FROM leagues_season_end_times
     WHERE season = $1`,
    [season]
  )
  return row as SeasonEndTimeInfo | null
}

export const insertSeasonEndTime = async (
  pg: SupabaseDirectClient,
  season: number,
  endTime: Date
): Promise<void> => {
  await pg.none(
    // Inserts with default status 'active'
    `INSERT INTO leagues_season_end_times (season, end_time)
     VALUES ($1, $2)
     ON CONFLICT (season) DO NOTHING`,
    [season, endTime.toISOString()]
  )
}

export const updateSeasonStatus = async (
  pg: SupabaseDirectClient,
  season: number,
  status: SeasonStatus
): Promise<void> => {
  await pg.none(
    `UPDATE leagues_season_end_times
     SET status = $2
     WHERE season = $1`,
    [season, status]
  )
}

export const getEffectiveCurrentSeason = async (): Promise<number> => {
  const pg = createSupabaseDirectClient()
  // Find the season marked as active
  const activeSeason = await pg.oneOrNone<{ season: number }>(
    `SELECT season FROM leagues_season_end_times WHERE status = 'active' LIMIT 1`
  )

  if (activeSeason?.season) {
    return activeSeason.season
  }

  // If no season is active (error state or initialization), find the latest completed and return + 1
  // This case *shouldn't* happen in normal operation after initialization.
  log.error(
    'No active season found in leagues_season_end_times! Falling back to latest completed + 1.'
  )
  const latestCompleted = await pg.oneOrNone<{ season: number }>(
    `SELECT max(season) as season FROM leagues_season_end_times WHERE status = 'complete'`
  )

  if (latestCompleted?.season) {
    return latestCompleted.season + 1
  }

  // If the table is completely empty (very first run ever)
  log.error(
    'leagues_season_end_times table appears empty. Defaulting to season 1.'
  )
  return 1
}

export type SeasonBoundaries = {
  seasonStart: number
  seasonEnd: number
  status: SeasonStatus
}

/**
 * Gets the authoritative start and end times for a season.
 *
 * - Season start: Previous season's end_time (or calculated date for season 1)
 * - Season end: Current season's end_time from leagues_season_end_times table
 */
export const getSeasonStartAndEnd = async (
  pg: SupabaseDirectClient,
  season: number
): Promise<SeasonBoundaries | null> => {
  const seasonInfo = await getSeasonEndTimeRow(pg, season)
  if (!seasonInfo) {
    return null
  }

  let seasonStart: number

  if (season === 1) {
    // First season starts at the league start time
    const { start } = getApproximateSeasonDates(1)
    seasonStart = start.getTime()
  } else {
    // All other seasons start exactly when the previous season ends
    const prevSeasonInfo = await getSeasonEndTimeRow(pg, season - 1)
    if (!prevSeasonInfo) {
      log.error(
        `Previous season ${
          season - 1
        } not found in leagues_season_end_times. Cannot determine start time for season ${season}.`
      )
      return null
    }
    seasonStart = prevSeasonInfo.end_time
  }

  return {
    seasonStart,
    seasonEnd: seasonInfo.end_time,
    status: seasonInfo.status,
  }
}
