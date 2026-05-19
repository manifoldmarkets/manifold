import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'
import { convertShopOrder } from 'common/shop/types'

// Map dateRange prop -> Postgres interval string ('1 week', '3 months', ...).
// 'all' returns null which the SQL treats as "no date filter".
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

  // Passed as a bind parameter and cast to `interval` server-side. When
  // dateRange = 'all' the interval is null, so the cast is null and the
  // `IS NULL` arm of the OR short-circuits the date filter without
  // branching the query string. No user-supplied SQL anywhere in the path.
  const interval = dateRangeToInterval(dateRange)

  const [orders, countResult] = await Promise.all([
    pg.manyOrNone(
      `SELECT so.*, u.username, u.name as display_name
         FROM shop_orders so
         JOIN users u ON u.id = so.user_id
        WHERE so.item_id LIKE 'merch-%'
          AND ($3::interval IS NULL
               OR so.created_time >= now() - $3::interval)
        ORDER BY so.created_time DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset, interval]
    ),
    pg.one(
      `SELECT count(*)::int as total FROM shop_orders
        WHERE item_id LIKE 'merch-%'
          AND ($1::interval IS NULL
               OR created_time >= now() - $1::interval)`,
      [interval]
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
