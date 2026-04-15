import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getTicketItems } from 'common/shop/items'

export const getUserTicketPurchased: APIHandler<
  'get-user-ticket-purchased'
> = async (_props, auth) => {
  // Returns true if the user has purchased ANY Manifest ticket — all variants
  // share one purchase slot (early-bird blocks standard and vice versa).
  const pg = createSupabaseDirectClient()
  const allTicketIds = getTicketItems().map((t) => t.id)
  const row = await pg.oneOrNone(
    `SELECT 1 FROM shop_orders
     WHERE user_id = $1 AND item_id = ANY($2::text[])
     AND status NOT IN ('FAILED', 'REFUNDED', 'CANCELLED')
     LIMIT 1`,
    [auth.uid, allTicketIds]
  )
  return { purchased: !!row }
}
