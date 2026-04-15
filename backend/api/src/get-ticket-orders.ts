import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'

export const getTicketOrders: APIHandler<'get-ticket-orders'> = async (
  { itemId },
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)

  const pg = createSupabaseDirectClient()

  const itemFilter = itemId ? `AND so.item_id = $1` : `AND so.item_id = 'manifest-ticket'`
  const params = itemId ? [itemId] : []

  const rows = await pg.manyOrNone<{
    id: string
    user_id: string
    username: string
    display_name: string
    email: string | null
    item_id: string
    price_mana: string
    status: string
    created_time: Date
  }>(
    `SELECT
       so.id,
       so.user_id,
       u.username,
       u.data->>'name' as display_name,
       pu.data->>'email' as email,
       so.item_id,
       so.price_mana,
       so.status,
       so.created_time
     FROM shop_orders so
     JOIN users u ON u.id = so.user_id
     LEFT JOIN private_users pu ON pu.id = so.user_id
     WHERE 1=1 ${itemFilter}
     ORDER BY so.created_time DESC`,
    params
  )

  const orders = rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name ?? row.username,
    email: row.email,
    itemId: row.item_id,
    priceMana: Number(row.price_mana),
    status: row.status,
    createdTime: new Date(row.created_time).getTime(),
  }))

  return { orders, total: orders.length }
}
