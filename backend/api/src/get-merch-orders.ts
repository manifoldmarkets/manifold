import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'
import { convertShopOrder } from 'common/shop/types'

// Statuses that represent "real revenue" for stats purposes — mirrors the
// merchSales filter in get-shop-stats.ts so admin numbers match /stats.
const REVENUE_STATUSES_SQL = `status not in ('CANCELLED', 'REFUNDED', 'FAILED')`

// Map dateRange prop -> Postgres interval. 'all' returns null (no filter).
const dateRangeToInterval = (
  dateRange: 'all' | 'month' | '3-months' | '6-months' | 'year'
): string | null => {
  switch (dateRange) {
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
  // Built once and reused across all 4 queries so the orders list, count,
  // per-item stats, and overall stats all reflect the same time window.
  // The `interval` value comes from a fixed enum mapping — no user-supplied
  // SQL ever reaches this string, so interpolation is safe.
  const dateClause = (prefix: string) =>
    interval ? `and ${prefix}created_time >= now() - interval '${interval}'` : ''

  const [orders, countResult, perItemStats, overallStats] = await Promise.all([
    pg.manyOrNone(
      `SELECT so.*, u.username, u.name as display_name
       FROM shop_orders so
       JOIN users u ON u.id = so.user_id
       WHERE so.item_id LIKE 'merch-%'
       ${dateClause('so.')}
       ORDER BY so.created_time DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pg.one(
      `SELECT count(*)::int as total FROM shop_orders
       WHERE item_id LIKE 'merch-%' ${dateClause('')}`
    ),
    // Per-item stats exclude refunded/cancelled/failed so they reflect real
    // revenue (matches the merchSales filter in get-shop-stats.ts).
    pg.manyOrNone<{
      itemId: string
      orderCount: number
      totalMana: number
      avgMana: number
    }>(
      `SELECT
         item_id as "itemId",
         count(*)::int as "orderCount",
         sum(price_mana)::bigint as "totalMana",
         avg(price_mana)::float as "avgMana"
       FROM shop_orders
       WHERE item_id LIKE 'merch-%'
         AND ${REVENUE_STATUSES_SQL}
         ${dateClause('')}
       GROUP BY item_id
       ORDER BY sum(price_mana) DESC`
    ),
    pg.one<{
      orderCount: number
      totalMana: number
      avgMana: number | null
    }>(
      `SELECT
         count(*)::int as "orderCount",
         coalesce(sum(price_mana), 0)::bigint as "totalMana",
         avg(price_mana)::float as "avgMana"
       FROM shop_orders
       WHERE item_id LIKE 'merch-%'
         AND ${REVENUE_STATUSES_SQL}
         ${dateClause('')}`
    ),
  ])

  return {
    orders: orders.map((row) => ({
      ...convertShopOrder(row),
      username: row.username as string,
      displayName: row.display_name as string,
    })),
    total: countResult.total as number,
    stats: {
      perItem: (perItemStats ?? []).map((row) => ({
        itemId: row.itemId,
        orderCount: Number(row.orderCount),
        totalMana: Number(row.totalMana),
        avgMana: Number(row.avgMana),
      })),
      overall: {
        orderCount: Number(overallStats.orderCount),
        totalMana: Number(overallStats.totalMana),
        avgMana: overallStats.avgMana == null ? 0 : Number(overallStats.avgMana),
      },
    },
  }
}
