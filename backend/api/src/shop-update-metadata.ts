import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  getShopItem,
  getEntitlementId,
  YES_BUTTON_OPTIONS,
  NO_BUTTON_OPTIONS,
} from 'common/shop/items'
import { convertEntitlement } from 'common/shop/types'

// Per-item metadata validation: only allow known keys with expected value types
function validateItemMetadata(itemId: string, metadata: Record<string, string | number>): void {
  switch (itemId) {
    case 'pampu-skin': {
      if (Object.keys(metadata).length !== 1 || !('selectedText' in metadata)) {
        throw new APIError(400, 'pampu-skin metadata must contain only "selectedText"')
      }
      if (!(YES_BUTTON_OPTIONS as readonly (string | number)[]).includes(metadata.selectedText)) {
        throw new APIError(400, `Invalid selectedText. Must be one of: ${YES_BUTTON_OPTIONS.join(', ')}`)
      }
      break
    }
    case 'custom-no-button': {
      if (Object.keys(metadata).length !== 1 || !('selectedText' in metadata)) {
        throw new APIError(400, 'custom-no-button metadata must contain only "selectedText"')
      }
      if (!(NO_BUTTON_OPTIONS as readonly (string | number)[]).includes(metadata.selectedText)) {
        throw new APIError(400, `Invalid selectedText. Must be one of: ${NO_BUTTON_OPTIONS.join(', ')}`)
      }
      break
    }
    case 'avatar-crown': {
      if (Object.keys(metadata).length !== 1 || !('style' in metadata)) {
        throw new APIError(400, 'avatar-crown metadata must contain only "style"')
      }
      const style = Number(metadata.style)
      if (!Number.isInteger(style) || style < 0 || style > 2) {
        throw new APIError(400, 'avatar-crown style must be 0 (Right), 1 (Left), or 2 (Center)')
      }
      break
    }
    default:
      throw new APIError(400, 'This item does not support metadata customization')
  }
}

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

  // Validate metadata structure for this specific item before touching the DB
  validateItemMetadata(itemId, metadata)

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
