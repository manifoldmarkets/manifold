import { APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { CHARITY_CHAMPION_ENTITLEMENT_ID } from 'common/shop/items'
import { convertEntitlement } from 'common/shop/types'

export const claimCharityChampion: APIHandler<'claim-charity-champion'> = async (
  props,
  auth
) => {
  const { enabled = true } = props
  const pg = createSupabaseDirectClient()

  return await pg.tx(async (tx) => {
    // Get the current or most recent giveaway
    const giveaway = await tx.oneOrNone<{
      giveaway_num: number
      close_time: string
    }>(
      `SELECT giveaway_num, close_time FROM charity_giveaways
       ORDER BY
         CASE WHEN close_time > NOW() THEN 0 ELSE 1 END,
         close_time DESC
       LIMIT 1`
    )

    if (!giveaway) {
      throw new APIError(404, 'No charity giveaway found')
    }

    // Get the current champion (user with most tickets)
    const championRow = await tx.oneOrNone<{
      user_id: string
      total_tickets: string
    }>(
      `SELECT user_id, SUM(num_tickets) as total_tickets
       FROM charity_giveaway_tickets
       WHERE giveaway_num = $1
       GROUP BY user_id
       ORDER BY total_tickets DESC
       LIMIT 1`,
      [giveaway.giveaway_num]
    )

    if (!championRow) {
      throw new APIError(400, 'No tickets have been purchased yet')
    }

    // Check if the requesting user is the current champion
    if (championRow.user_id !== auth.uid) {
      throw new APIError(
        403,
        'Only the #1 ticket buyer can claim the Charity Champion Trophy'
      )
    }

    // Revoke the trophy from anyone else who has it
    await tx.none(
      `UPDATE user_entitlements
       SET enabled = false
       WHERE entitlement_id = $1 AND user_id != $2`,
      [CHARITY_CHAMPION_ENTITLEMENT_ID, auth.uid]
    )

    // Check if user already has the entitlement
    const existingEntitlement = await tx.oneOrNone<{ user_id: string }>(
      `SELECT user_id FROM user_entitlements
       WHERE user_id = $1 AND entitlement_id = $2`,
      [auth.uid, CHARITY_CHAMPION_ENTITLEMENT_ID]
    )

    if (existingEntitlement) {
      // Update the existing entitlement
      await tx.none(
        `UPDATE user_entitlements
         SET enabled = $1, granted_time = NOW()
         WHERE user_id = $2 AND entitlement_id = $3`,
        [enabled, auth.uid, CHARITY_CHAMPION_ENTITLEMENT_ID]
      )
    } else {
      // Create new entitlement
      await tx.none(
        `INSERT INTO user_entitlements (user_id, entitlement_id, granted_time, enabled)
         VALUES ($1, $2, NOW(), $3)`,
        [auth.uid, CHARITY_CHAMPION_ENTITLEMENT_ID, enabled]
      )
    }

    // Fetch updated entitlements for the user
    const entitlementRows = await tx.manyOrNone<{
      user_id: string
      entitlement_id: string
      granted_time: string
      expires_time: string | null
      enabled: boolean
    }>(
      `SELECT user_id, entitlement_id, granted_time, expires_time, enabled
       FROM user_entitlements
       WHERE user_id = $1
       AND (expires_time IS NULL OR expires_time > NOW())`,
      [auth.uid]
    )

    return {
      success: true,
      entitlements: entitlementRows.map(convertEntitlement),
    }
  })
}
