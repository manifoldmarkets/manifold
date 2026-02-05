import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  getShopItem,
  getEntitlementId,
  EXCLUSIVE_CATEGORIES,
  getEntitlementIdsForCategory,
  getEntitlementIdsForTeam,
  getOppositeTeam,
} from 'common/shop/items'
import { convertEntitlement } from 'common/shop/types'

export const shopToggle: APIHandler<'shop-toggle'> = async (
  { itemId, enabled },
  auth
) => {
  if (!auth) {
    throw new APIError(401, 'Must be logged in')
  }

  const item = getShopItem(itemId)
  if (!item) {
    throw new APIError(404, 'Item not found')
  }

  // Only toggleable items can be toggled
  if (item.type !== 'permanent-toggleable' && item.type !== 'time-limited') {
    throw new APIError(400, 'This item cannot be toggled')
  }

  // Items marked as alwaysEnabled cannot be toggled
  if (item.alwaysEnabled) {
    throw new APIError(400, 'This item is always enabled and cannot be toggled')
  }

  const entitlementId = getEntitlementId(item)
  const pg = createSupabaseDirectClient()

  const result = await pg.tx(async (tx) => {
    // If enabling an item in an exclusive category, disable others first
    if (enabled && EXCLUSIVE_CATEGORIES.includes(item.category)) {
      const categoryEntitlementIds = getEntitlementIdsForCategory(item.category)
      await tx.none(
        `UPDATE user_entitlements
         SET enabled = false
         WHERE user_id = $1
         AND entitlement_id = ANY($2)
         AND entitlement_id != $3`,
        [auth.uid, categoryEntitlementIds, entitlementId]
      )
    }

    // If enabling an item with explicit conflicts, disable conflicting items
    if (enabled && item.conflicts?.length) {
      await tx.none(
        `UPDATE user_entitlements
         SET enabled = false
         WHERE user_id = $1
         AND entitlement_id = ANY($2)`,
        [auth.uid, item.conflicts]
      )
    }

    // If enabling a team item, disable items from the opposite team
    if (enabled && item.team) {
      const oppositeTeamIds = getEntitlementIdsForTeam(getOppositeTeam(item.team))
      if (oppositeTeamIds.length > 0) {
        await tx.none(
          `UPDATE user_entitlements
           SET enabled = false
           WHERE user_id = $1
           AND entitlement_id = ANY($2)`,
          [auth.uid, oppositeTeamIds]
        )
      }
    }

    // Update the enabled status in user_entitlements table
    const updateResult = await tx.oneOrNone(
      `UPDATE user_entitlements
       SET enabled = $1
       WHERE user_id = $2 AND entitlement_id = $3
         AND (expires_time IS NULL OR expires_time > NOW())
       RETURNING *`,
      [enabled, auth.uid, entitlementId]
    )

    if (!updateResult) {
      // Check if they own it but it's expired
      const expired = await tx.oneOrNone(
        `SELECT 1 FROM user_entitlements
         WHERE user_id = $1 AND entitlement_id = $2 AND expires_time <= NOW()`,
        [auth.uid, entitlementId]
      )
      if (expired) {
        throw new APIError(400, 'This item has expired')
      }
      throw new APIError(404, 'You do not own this item')
    }

    // Fetch all entitlements after the transaction to return updated state
    const allEntitlements = await tx.manyOrNone(
      `SELECT * FROM user_entitlements WHERE user_id = $1`,
      [auth.uid]
    )

    return { entitlements: allEntitlements.map(convertEntitlement) }
  })

  return { success: true, entitlements: result.entitlements }
}
