import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getTrophyClaims } from 'api/helpers/trophies'
import { isAdminId } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'

// Admin testing tool: removes every claimed milestone of one trophy for a user.
export const unclaimTrophy: APIHandler<'unclaim-trophy'> = async (
  { trophyId, userId },
  auth
) => {
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can unclaim trophies')
  }

  const pg = createSupabaseDirectClient()
  await pg.none(
    `delete from user_trophy_milestones where user_id = $1 and trophy_id = $2`,
    [userId, trophyId]
  )

  return { claims: await getTrophyClaims(pg, userId) }
}
