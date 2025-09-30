import { APIHandler, APIError } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getVeryRichBadge: APIHandler<'get-very-rich-badge'> = async (
  { userId },
  auth
) => {
  const targetId = userId ?? auth?.uid
  if (!targetId) throw new APIError(400, 'userId is required')
  const pg = createSupabaseDirectClient()
  const row = await pg.oneOrNone<{ sum: string }>(
    `select coalesce(sum(amount_spent_mana), 0) as sum
       from shop_orders
      where user_id = $1 and item_id = 'very-rich-badge'`,
    [targetId]
  )
  const amount = Number(row?.sum ?? 0)
  return { amountSpentMana: amount }
}
