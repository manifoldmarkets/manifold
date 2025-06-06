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
      .gte('created_time', new Date(since).toISOString())
      .eq('data->>referredByUserId', userId)
  )
  return count
}

export async function getUserReferralsInfo(userId: string, db: SupabaseClient) {
  const { data } = await run(
    db.from('user_referrals_profit').select('*').eq('id', userId)
  )

  return { ...data[0], rank: data[0]?.rank ?? 0 }
}
