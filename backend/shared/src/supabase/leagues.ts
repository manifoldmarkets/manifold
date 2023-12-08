import { convertLeague } from 'common/supabase/leagues'
import { type SupabaseClient, run } from 'common/supabase/utils'

export async function getLeaguesForUser(
  db: SupabaseClient,
  filters: {
    userId: string
    season?: number
  }
) {
  const { userId, season } = filters

  let q = db
    .from('leagues')
    .select()
    .eq('user_id', userId)
    .order('created_time', { ascending: false } as any)

  if (season) q = q.eq('season', season)

  const res = await run(q)
  return res.data.map(convertLeague)
}
