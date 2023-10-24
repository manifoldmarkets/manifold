import { SupabaseClient, run, millisToTs } from 'common/supabase/utils'

export async function getUniqueUserShareEventsCount(
  userId: string,
  startTime: number,
  db: SupabaseClient
) {
  const q = db
    .from('user_events')
    .select('*', { head: true, count: 'exact' })
    .eq('user_id', userId)
    .gt('ts', millisToTs(startTime))
    .eq('data->>type', 'copy sharing link')

  const { count } = await run(q)
  return count
}
