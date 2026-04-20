import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getShopItem, getTicketItems, isTicketItem } from 'common/shop/items'

export const getTicketStock: APIHandler<'get-ticket-stock'> = async ({
  itemId,
}) => {
  const pg = createSupabaseDirectClient()

  // No itemId → aggregate across all ticket items
  if (!itemId) {
    const tickets = getTicketItems()
    const ids = tickets.map((t) => t.id)
    const maxStock = tickets.reduce((sum, t) => sum + (t.maxStock ?? 0), 0)
    const { count } = await pg.one<{ count: number }>(
      `SELECT count(*)::int AS count FROM shop_orders
       WHERE item_id = ANY($1)
       AND status NOT IN ('FAILED', 'REFUNDED', 'CANCELLED')`,
      [ids]
    )
    return {
      sold: count,
      maxStock,
      available: Math.max(0, maxStock - count),
    }
  }

  const item = getShopItem(itemId)
  if (!item || !isTicketItem(item)) {
    throw new APIError(404, 'Ticket item not found')
  }
  const maxStock = item.maxStock ?? 0

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
