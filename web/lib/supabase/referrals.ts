import { run } from 'common/supabase/utils'
import { db } from 'common/supabase/db'
import { type DisplayUser } from 'common/api/user-types'

export async function getReferrals(userId: string) {
  const { data } = await run(
    db
      .from('users')
      .select(`id, name, username, data->avatarUrl, data->isBannedFromPosting`)
      .contains('data', {
        referredByUserId: userId,
      })
  )

  return data as unknown as DisplayUser[]
}
