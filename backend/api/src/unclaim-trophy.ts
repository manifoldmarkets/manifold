import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getTrophyClaims } from 'api/helpers/trophies'
import { isAdminId } from 'common/envs/constants'
import { getTrophyPinId } from 'common/trophies'
import { createSupabaseDirectClient } from 'shared/supabase/init'

// Admin testing tool: removes every claimed milestone of one trophy for a
// user, and the trophy's profile pin. Paid rewards are recorded separately in
// user_trophy_rewards and stay, so claiming again cannot pay twice.
export const unclaimTrophy: APIHandler<'unclaim-trophy'> = async (
  { trophyId, userId },
  auth
) => {
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can unclaim trophies')
  }

  const pg = createSupabaseDirectClient()
  await pg.tx(async (tx) => {
    // The same lock set-showcase-pins takes, so a pin save that checked the
    // claims before this can't put the pin back afterwards.
    const user = await tx.oneOrNone(
      `select 1 from users where id = $1 for no key update`,
      [userId]
    )
    if (!user) throw new APIError(404, 'User not found')
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
