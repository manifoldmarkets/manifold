import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'
import { convertShopOrder } from 'common/shop/types'

export const getMerchOrders: APIHandler<'get-merch-orders'> = async (
  { limit, offset },
  auth
) => {
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can view merch orders')
  }

  const pg = createSupabaseDirectClient()

  const [orders, countResult] = await Promise.all([
    pg.manyOrNone(
      `SELECT so.*, u.username, u.name as display_name
       FROM shop_orders so
       JOIN users u ON u.id = so.user_id
       WHERE so.item_id LIKE 'merch-%'
       ORDER BY so.created_time DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pg.one(
      `SELECT count(*)::int as total FROM shop_orders WHERE item_id LIKE 'merch-%'`
    ),
  ])

  return {
    orders: orders.map((row) => ({
      ...convertShopOrder(row),
      username: row.username as string,
      displayName: row.display_name as string,
    })),
    total: countResult.total as number,
  }
}
