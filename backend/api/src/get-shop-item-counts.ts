import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getEnabledConfigs } from 'common/shop/items'

export const getShopItemCounts: APIHandler<
  'get-shop-item-counts'
> = async () => {
  const pg = createSupabaseDirectClient()

  // Get all items that have global limits
  const itemsWithLimits = getEnabledConfigs().filter(
    (item) => item.globalLimit !== undefined
  )
  const itemIds = itemsWithLimits.map((item) => item.id)

  if (itemIds.length === 0) {
    return { counts: {} }
  }

  // Count current owners for each item with a global limit
  const rows = await pg.manyOrNone(
    `select entitlement_id, count(*) as count
     from user_entitlements
     where entitlement_id = ANY($1)
     group by entitlement_id`,
    [itemIds]
  )

  const counts: { [itemId: string]: number } = {}

  // Initialize all items with 0 count
  itemIds.forEach((id) => {
    counts[id] = 0
  })

  // Update with actual counts
  rows.forEach((row: any) => {
    counts[row.entitlement_id] = parseInt(row.count)
  })

  return { counts }
}
