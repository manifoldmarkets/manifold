import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getTrophyClaims } from 'api/helpers/trophies'
import { isAdminId } from 'common/envs/constants'
import { getTrophyPinId } from 'common/trophies'
import { createSupabaseDirectClient } from 'shared/supabase/init'

// Admin testing tool: removes a user's claimed milestones of one trophy, and
// the trophy's profile pin once none is left. Milestones that paid a reward
// stay claimed, so claiming again cannot pay twice.
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
      `delete from user_trophy_milestones
       where user_id = $1 and trophy_id = $2 and reward_txn_id is null`,
      [userId, trophyId]
    )
    await tx.none(
      `update user_showcase
       set pins = array_remove(pins, $3), updated_at = now()
       where user_id = $1 and $3 = any(pins)
         and not exists (
           select 1 from user_trophy_milestones
           where user_id = $1 and trophy_id = $2
         )`,
      [userId, trophyId, getTrophyPinId(trophyId)]
    )
  })

  return { claims: await getTrophyClaims(pg, userId) }
}
