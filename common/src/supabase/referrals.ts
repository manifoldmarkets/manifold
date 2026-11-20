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

  const info = data[0]
  return info
    ? { ...info, rank: info.rank ?? 0 }
    : {
        rank: 0,
        total_referrals: 0,
        total_referred_cash_profit: 0,
        total_referred_profit: 0,
      }
}
