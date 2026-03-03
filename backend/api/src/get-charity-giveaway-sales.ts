import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'

export const getCharityGiveawaySales: APIHandler<
  'get-charity-giveaway-sales'
> = async (props) => {
  const { giveawayNum, limit, before } = props
  const pg = createSupabaseDirectClient()

  const sales = await pg.manyOrNone<{
    id: string
    giveaway_num: number
    charity_id: string
    user_id: string
    num_tickets: number
    mana_spent: number
    created_time_ms: number
  }>(
    `SELECT id, giveaway_num, charity_id, user_id, num_tickets, mana_spent, ts_to_millis(created_time) as created_time_ms
     FROM charity_giveaway_tickets
     WHERE giveaway_num = $1
       ${before ? `AND id < $3` : ''}
     ORDER BY created_time DESC, id DESC
     LIMIT $2`,
    before ? [giveawayNum, limit, before] : [giveawayNum, limit]
  )

  return {
    sales: sales.map((s) => ({
      id: s.id,
      giveawayNum: s.giveaway_num,
      charityId: s.charity_id,
      userId: s.user_id,
      numTickets: s.num_tickets,
      manaSpent: s.mana_spent,
      createdTime: s.created_time_ms,
    })),
  }
}
