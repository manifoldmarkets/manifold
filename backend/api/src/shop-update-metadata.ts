import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getShopItem, getEntitlementId } from 'common/shop/items'
import { convertEntitlement } from 'common/shop/types'

export const shopUpdateMetadata: APIHandler<'shop-update-metadata'> = async (
  { itemId, metadata },
  auth
) => {
  if (!auth) {
    throw new APIError(401, 'Must be logged in')
  }

  const item = getShopItem(itemId)
  if (!item) {
    throw new APIError(404, 'Item not found')
  }

  const entitlementId = getEntitlementId(item)
  const pg = createSupabaseDirectClient()

  const result = await pg.tx(async (tx) => {
    // Verify user owns this entitlement
    const existing = await tx.oneOrNone(
      `SELECT * FROM user_entitlements
       WHERE user_id = $1 AND entitlement_id = $2`,
      [auth.uid, entitlementId]
    )

    if (!existing) {
      throw new APIError(404, 'You do not own this item')
    }

    // Update metadata
    await tx.none(
      `UPDATE user_entitlements
       SET metadata = $1
       WHERE user_id = $2 AND entitlement_id = $3`,
      [metadata, auth.uid, entitlementId]
    )

    // Fetch all entitlements after update
    const allEntitlements = await tx.manyOrNone(
      `SELECT * FROM user_entitlements WHERE user_id = $1`,
      [auth.uid]
    )

    return { entitlements: allEntitlements.map(convertEntitlement) }
  })

  return { success: true, entitlements: result.entitlements }
}
