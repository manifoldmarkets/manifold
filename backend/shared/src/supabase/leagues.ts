import { APIError } from 'common/api/utils'
import { convertLeague } from 'common/supabase/leagues'
import { type SupabaseClient, run } from 'common/supabase/utils'
import { createSupabaseDirectClient, SupabaseDirectClient } from './init'
import { log } from '../utils' // Assuming log exists

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
     FROM season_end_times
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
    `INSERT INTO season_end_times (season, end_time)
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
    `UPDATE season_end_times
     SET status = $2
     WHERE season = $1`,
    [season, status]
  )
}

export const getEffectiveCurrentSeason = async (): Promise<number> => {
  const pg = createSupabaseDirectClient()
  // Find the season marked as active
  const activeSeason = await pg.oneOrNone<{ season: number }>(
    `SELECT season FROM season_end_times WHERE status = 'active' LIMIT 1`
  )

  if (activeSeason?.season) {
    return activeSeason.season
  }

  // If no season is active (error state or initialization), find the latest completed and return + 1
  // This case *shouldn't* happen in normal operation after initialization.
  log.error(
    'No active season found in season_end_times! Falling back to latest completed + 1.'
  )
  const latestCompleted = await pg.oneOrNone<{ season: number }>(
    `SELECT max(season) as season FROM season_end_times WHERE status = 'complete'`
  )

  if (latestCompleted?.season) {
    return latestCompleted.season + 1
  }

  // If the table is completely empty (very first run ever)
  log.error('season_end_times table appears empty. Defaulting to season 1.')
  return 1
}
