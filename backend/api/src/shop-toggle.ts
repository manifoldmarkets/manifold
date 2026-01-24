import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { getShopItem } from 'common/shop/items'
import { updateUser } from 'shared/supabase/users'

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

  const pg = createSupabaseDirectClient()

  const user = await getUser(auth.uid, pg)
  if (!user) throw new APIError(401, 'Your account was not found')

  const purchases = user.shopPurchases ?? []
  const purchaseIndex = purchases.findIndex((p) => p.itemId === itemId)

  if (purchaseIndex === -1) {
    throw new APIError(404, 'You do not own this item')
  }

  const purchase = purchases[purchaseIndex]

  // Check if item has expired
  if (purchase.expiresAt && purchase.expiresAt < Date.now()) {
    throw new APIError(400, 'This item has expired')
  }

  // Update the enabled status
  const updatedPurchases = [...purchases]
  updatedPurchases[purchaseIndex] = {
    ...purchase,
    enabled,
  }

  await updateUser(pg, auth.uid, {
    shopPurchases: updatedPurchases,
  })

  return { success: true }
}
