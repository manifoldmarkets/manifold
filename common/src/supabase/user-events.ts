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
    .in('name', [
      'copy market link',
      'copy referral link',
      'copy comment link',
      'copy group link',
      'share home news item',
      'share user page',
      'copy questions page link',
      'copy dashboard link',
    ])

  const { count } = await run(q)
  return count
}
