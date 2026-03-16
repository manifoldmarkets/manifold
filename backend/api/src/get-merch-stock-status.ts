import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getMerchItems } from 'common/shop/items'

export const getMerchStockStatus: APIHandler<
  'get-merch-stock-status'
> = async () => {
  const pg = createSupabaseDirectClient()

  try {
    const rows = await pg.manyOrNone(
      `SELECT item_id FROM merch_stock_status WHERE out_of_stock = true`
    )
    return { outOfStockItems: rows.map((r) => r.item_id as string) }
  } catch (e) {
    // Fail-closed: if table doesn't exist, treat ALL merch as out of stock
    console.warn('merch_stock_status query failed (treating all as out of stock):', e)
    return { outOfStockItems: getMerchItems().map((i) => i.id) }
  }
}
