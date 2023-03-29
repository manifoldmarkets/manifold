import { run, SupabaseClient } from 'common/supabase/utils'

export async function getReferralCount(
  userId: string,
  since: number,
  db: SupabaseClient
) {
  const { count } = await run(
    db
      .from('users')
      .select('*', { head: true, count: 'exact' })
      .gte('data->>createdTime', since)
      .contains('data', { referredByUserId: userId })
  )
  return count
}
