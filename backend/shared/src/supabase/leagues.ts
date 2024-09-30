import { APIError } from 'common/api/utils'
import { convertLeague } from 'common/supabase/leagues'
import { run } from 'common/supabase/utils'
import { SupabaseDirectClient } from './init'
import { from, orderBy, renderSql, select, where } from './sql-builder'

export async function getLeaguesForUser(
  pg: SupabaseDirectClient,
  filters: {
    userId?: string
    cohort?: string
    season?: number
  }
) {
  const { userId, cohort, season } = filters

  if (!userId && !season && !cohort)
    throw new APIError(400, 'Must provide userId, season, or cohort')

  const q = renderSql(
    from('leagues'),
    select('*'),
    orderBy('created_time desc'),
    userId && where('user_id = $1', userId),
    cohort && where('cohort = $1', cohort),
    season && where('season = $1', season)
  )

  return await pg.map(q, [], convertLeague)
}
