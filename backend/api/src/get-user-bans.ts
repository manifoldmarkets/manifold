import { type APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { UserBan } from 'common/user'

export const getUserBans: APIHandler<'get-user-bans'> = async (
  { userId },
  auth
) => {
  // Ban details (reasons, who banned, history) are sensitive - restrict to mods/admins
  throwErrorIfNotMod(auth.uid)

  const pg = createSupabaseDirectClient()

  const bans = await pg.manyOrNone<UserBan>(
    `SELECT * FROM user_bans WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  )

  return { bans }
}
