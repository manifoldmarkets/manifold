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

  // Users can fetch their own bans, mods can fetch anyone's bans
  if (!isSelf && !isMod) {
    // Non-mods can only fetch their own bans
    return { bans: [] }
  }

  const bans = await pg.manyOrNone<UserBan>(
    `SELECT * FROM user_bans WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  )

  // For self-viewing, sanitize sensitive data (hide who banned them)
  if (isSelf && !isMod) {
    const sanitizedBans = bans.map(ban => ({
      ...ban,
      created_by: null, // Hide mod identity
      ended_by: ban.ended_by === auth.uid ? auth.uid : null, // Show if user dismissed their own alert
    }))
    return { bans: sanitizedBans }
  }

  return { bans }
}
