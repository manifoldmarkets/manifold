import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { type DisplayUser } from 'common/api/user-types'

export async function getReferrals(userId: string) {
  const { data } = await run(
    db
      .from('users')
      .select(`id, name, username, is_bot, data->avatarUrl, data->isBannedFromPosting`)
      .contains('data', {
        referredByUserId: userId,
      })
  )

  return (data ?? []).map((user) => ({
    ...user,
    isBot: (user as any).is_bot ?? undefined,
  })) as unknown as DisplayUser[]
}
