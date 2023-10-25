import { SupabaseClient, run } from 'common/supabase/utils'

export async function getUserShareEventsCount(
  userId: string,
  startTs: string,
  db: SupabaseClient
) {
  const q = db
    .from('user_events')
    .select('*', { head: true, count: 'exact' })
    .eq('user_id', userId)
    .gt('ts', startTs)
    .eq('data->>type', 'copy sharing link')

  const { count } = await run(q)
  return count
}
