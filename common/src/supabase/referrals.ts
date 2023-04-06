import { run, SupabaseClient } from 'common/supabase/utils'
import { User } from 'common/user'

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
      .eq('data->>referredByUserId', userId)
  )
  return count
}

export async function getTopReferrals(db: SupabaseClient) {
  const { data } = await run(db.from('user_referrals').select('*').limit(20))
  const users = data.map((r) => ({
    totalReferrals: r.total_referrals,
    rank: r.rank,
    ...(r.data as User),
  }))
  return users
}
export async function getReferrerRank(userId: string, db: SupabaseClient) {
  const { data } = await run(
    db.from('user_referrals').select('*').eq('id', userId)
  )
  let rank = 0
  if (data.length === 0) {
    const { count } = await db
      .from('user_referrals')
      .select('*', { head: true, count: 'exact' })
    rank = (count ?? Infinity) + 1
  }

  return { ...data[0], fallbackRank: rank }
}
