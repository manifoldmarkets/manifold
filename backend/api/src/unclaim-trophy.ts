import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getTrophyClaims } from 'api/helpers/trophies'
import { isAdminId } from 'common/envs/constants'
import { getTrophyPinId } from 'common/trophies'
import { createSupabaseDirectClient } from 'shared/supabase/init'

// Admin testing tool: removes every claimed milestone of one trophy for a
// user, and the trophy's profile pin.
export const unclaimTrophy: APIHandler<'unclaim-trophy'> = async (
  { trophyId, userId },
  auth
) => {
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can unclaim trophies')
  }

  const pg = createSupabaseDirectClient()
  await pg.tx(async (tx) => {
    await tx.none(
      `delete from user_trophy_milestones where user_id = $1 and trophy_id = $2`,
      [userId, trophyId]
    )
    await tx.none(
      `update user_showcase
       set pins = array_remove(pins, $2), updated_at = now()
       where user_id = $1 and $2 = any(pins)`,
      [userId, getTrophyPinId(trophyId)]
    )
  })

  return { claims: await getTrophyClaims(pg, userId) }
}
