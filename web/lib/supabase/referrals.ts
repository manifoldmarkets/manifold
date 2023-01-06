import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { SearchUserInfo } from 'web/lib/supabase/users'

export async function getReferrals(userId: string) {
  const { data } = await run(
    db
      .from('users')
      .select('id, data->name, data->username, data->avatarUrl')
      .contains('data', { referredByUserId: userId })
  )
  return data as SearchUserInfo[]
}

export async function getReferralCount(userId: string) {
  const { data } = await run(
    db
      .from('users')
      .select('count')
      .contains('data', { referredByUserId: userId })
  )
  return data[0].count as number
}
