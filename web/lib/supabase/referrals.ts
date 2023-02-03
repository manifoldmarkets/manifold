import { run, selectFrom } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export async function getReferrals(userId: string) {
  const query = selectFrom(
    db,
    'users',
    'id',
    'name',
    'username',
    'avatarUrl'
  ).contains('data', { referredByUserId: userId })

  return (await run(query)).data
}

export async function getReferralCount(userId: string) {
  const { count } = await run(
    db
      .from('users')
      .select('*', { head: true, count: 'exact' })
      .contains('data', { referredByUserId: userId })
  )
  return count
}
