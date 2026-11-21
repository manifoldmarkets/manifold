import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'
import { isMerchItem, getShopItem } from 'common/shop/items'

export const toggleMerchStock: APIHandler<'toggle-merch-stock'> = async (
  { itemId },
  auth
) => {
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can toggle merch stock')
  }

  const item = getShopItem(itemId)
  if (!item || !isMerchItem(item)) {
    throw new APIError(404, 'Merch item not found')
  }

  const pg = createSupabaseDirectClient()

  try {
    const result = await pg.one(
      `INSERT INTO merch_stock_status (item_id, out_of_stock)
       VALUES ($1, true)
       ON CONFLICT (item_id) DO UPDATE SET out_of_stock = NOT merch_stock_status.out_of_stock
       RETURNING out_of_stock`,
      [itemId]
    )

    return { itemId, outOfStock: result.out_of_stock as boolean }
  } catch (e) {
    console.error('toggle-merch-stock failed:', e)
    throw new APIError(
      500,
      'Failed to toggle stock status — merch_stock_status table may not exist yet'
    )
  }
}
