import { type APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId, isModId } from 'common/envs/constants'
import { UserBan } from 'common/user'

export const getUserBans: APIHandler<'get-user-bans'> = async (
  { userId },
  auth
) => {
  const pg = createSupabaseDirectClient()
  const isMod = isModId(auth.uid) || isAdminId(auth.uid)
  const isSelf = auth.uid === userId

  const bans = await pg.manyOrNone<UserBan>(
    `SELECT * FROM user_bans WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  )

  if (isMod) {
    return { bans }
  }

  if (isSelf) {
    // Self-viewing: hide mod identity but keep reasons and own alert dismissals
    const sanitizedBans = bans.map((ban) => ({
      ...ban,
      created_by: null,
      ended_by: ban.ended_by === auth.uid ? auth.uid : null,
    }))
    return { bans: sanitizedBans }
  }

  // Public viewers: expose only what the Restricted badge needs to render.
  // Drop modAlerts (internal-only) and strip reasons + mod identities.
  const publicBans = bans
    .filter((ban) => ban.ban_type !== 'modAlert')
    .map((ban) => ({
      ...ban,
      reason: null,
      created_by: null,
      ended_by: null,
    }))
  return { bans: publicBans }
}
