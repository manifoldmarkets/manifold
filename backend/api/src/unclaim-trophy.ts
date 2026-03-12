import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'

export const unclaimTrophy: APIHandler<'unclaim-trophy'> = async (
  { trophyId },
  auth
) => {
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can unclaim trophies')
  }

  const pg = createSupabaseDirectClient()
  await pg.none(
    `delete from user_trophy_claims where user_id = $1 and trophy_id = $2`,
    [auth.uid, trophyId]
  )

  return { success: true }
}
