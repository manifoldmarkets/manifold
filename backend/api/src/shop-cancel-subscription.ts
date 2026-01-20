import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertEntitlement } from 'common/shop/types'
import { SUPPORTER_ENTITLEMENT_IDS } from 'common/supporter-config'

export const shopCancelSubscription: APIHandler<
  'shop-cancel-subscription'
> = async (_, auth) => {
  if (!auth) {
    throw new APIError(401, 'Must be logged in')
  }

  const pg = createSupabaseDirectClient()

  const result = await pg.tx(async (tx) => {
    // Find user's active supporter entitlement
    const supporterEntitlement = await tx.oneOrNone(
      `SELECT * FROM user_entitlements
       WHERE user_id = $1
       AND entitlement_id = ANY($2)
       AND enabled = true
       AND (expires_time IS NULL OR expires_time > NOW())`,
      [auth.uid, [...SUPPORTER_ENTITLEMENT_IDS]]
    )

    if (!supporterEntitlement) {
      throw new APIError(404, 'No active membership subscription found')
    }

    // Set auto_renew = false (subscription will run until expiration but not renew)
    await tx.none(
      `UPDATE user_entitlements
       SET auto_renew = false
       WHERE user_id = $1 AND entitlement_id = $2`,
      [auth.uid, supporterEntitlement.entitlement_id]
    )

    // Fetch all entitlements after the update to return current state
    const allEntitlements = await tx.manyOrNone(
      `SELECT * FROM user_entitlements WHERE user_id = $1`,
      [auth.uid]
    )

    return { entitlements: allEntitlements.map(convertEntitlement) }
  })

  return { success: true, entitlements: result.entitlements }
}
