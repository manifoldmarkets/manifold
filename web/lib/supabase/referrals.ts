import { run, selectFrom } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export async function getReferrals(userId: string) {
  const fields = ['id', 'name', 'username', 'avatarUrl'] as const

  const query = selectFrom(db, 'users', ...fields).contains('data', {
    referredByUserId: userId,
  })

  return (await run(query)).data
}
