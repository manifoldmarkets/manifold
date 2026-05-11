import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'
import { convertShopOrder } from 'common/shop/types'

// Map dateRange prop -> Postgres interval. 'all' returns null (no filter).
const dateRangeToInterval = (
  dateRange: 'all' | 'week' | 'month' | '3-months' | '6-months' | 'year'
): string | null => {
  switch (dateRange) {
    case 'week':
      return '1 week'
    case 'month':
      return '1 month'
    case '3-months':
      return '3 months'
    case '6-months':
      return '6 months'
    case 'year':
      return '1 year'
    default:
      return null
  }
}

export const getMerchOrders: APIHandler<'get-merch-orders'> = async (
  { limit, offset, dateRange },
  auth
) => {
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can view merch orders')
  }

  const pg = createSupabaseDirectClient()

  const interval = dateRangeToInterval(dateRange)
  // The `interval` value comes from a fixed enum mapping — no user-supplied
  // SQL ever reaches this string, so interpolation is safe.
  const dateClause = interval
    ? `and so.created_time >= now() - interval '${interval}'`
    : ''
  const dateClauseNoPrefix = interval
    ? `and created_time >= now() - interval '${interval}'`
    : ''

  const [orders, countResult] = await Promise.all([
    pg.manyOrNone(
      `SELECT so.*, u.username, u.name as display_name
       FROM shop_orders so
       JOIN users u ON u.id = so.user_id
       WHERE so.item_id LIKE 'merch-%'
       ${dateClause}
       ORDER BY so.created_time DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pg.one(
      `SELECT count(*)::int as total FROM shop_orders
       WHERE item_id LIKE 'merch-%' ${dateClauseNoPrefix}`
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
