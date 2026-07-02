import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertShopOrder } from 'common/shop/types'

export const getUserMerchOrders: APIHandler<
  'get-user-merch-orders'
> = async (_props, auth) => {
  const pg = createSupabaseDirectClient()

  const rows = await pg.manyOrNone(
    `SELECT * FROM shop_orders
     WHERE user_id = $1 AND item_id LIKE 'merch-%'
     AND status NOT IN ('FAILED', 'REFUNDED', 'CANCELLED')
     ORDER BY created_time DESC`,
    [auth.uid]
  )

  return { orders: rows.map(convertShopOrder) }
}
