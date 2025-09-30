import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getEnabledConfigs } from 'common/shop/items'

export const getShopItemCounts: APIHandler<
  'get-shop-item-counts'
> = async () => {
  const pg = createSupabaseDirectClient()

  // Count all enabled digital items (used for global caps and dynamic pricing)
  const itemIds = getEnabledConfigs()
    .filter((item) => item.type === 'digital')
    .map((item) => item.id)

  if (itemIds.length === 0) {
    return { counts: {} }
  }

  // Count total purchases from shop_orders for digital items
  const rows = await pg.manyOrNone(
    `select item_id, coalesce(sum(quantity), 0) as count
       from shop_orders
      where item_type = 'digital' and item_id = ANY($1)
      group by item_id`,
    [itemIds]
  )

  const counts: { [itemId: string]: number } = {}

  // Initialize all items with 0 count
  itemIds.forEach((id) => {
    counts[id] = 0
  })

  // Update with actual counts
  rows.forEach((row: any) => {
    counts[row.item_id] = parseInt(row.count)
  })

  return { counts }
}
