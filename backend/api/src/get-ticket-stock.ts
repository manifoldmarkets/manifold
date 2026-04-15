import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getShopItem, isTicketItem } from 'common/shop/items'

export const getTicketStock: APIHandler<'get-ticket-stock'> = async ({
  itemId,
}) => {
  const item = getShopItem(itemId)
  if (!item || !isTicketItem(item)) {
    throw new APIError(404, 'Ticket item not found')
  }
  const maxStock = item.maxStock ?? 0

  const pg = createSupabaseDirectClient()
  const { count } = await pg.one<{ count: number }>(
    `SELECT count(*)::int AS count FROM shop_orders
     WHERE item_id = $1
     AND status NOT IN ('FAILED', 'REFUNDED', 'CANCELLED')`,
    [itemId]
  )

  return {
    sold: count,
    maxStock,
    available: Math.max(0, maxStock - count),
  }
}
