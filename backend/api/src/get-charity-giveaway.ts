import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { tsToMillis } from 'common/supabase/utils'

export const getCharityGiveaway: APIHandler<'get-charity-giveaway'> = async (
  props
) => {
  const { giveawayNum } = props
  const pg = createSupabaseDirectClient()

  // If no giveawayNum specified, get the most recent active giveaway (not yet closed)
  // or the most recent giveaway overall
  const giveaway = await pg.oneOrNone<{
    giveaway_num: number
    name: string
    prize_amount_usd: number
    close_time: string
    winning_ticket_id: string | null
    created_time: string
  }>(
    giveawayNum
      ? `SELECT * FROM charity_giveaways WHERE giveaway_num = $1`
      : `SELECT * FROM charity_giveaways 
         ORDER BY 
           CASE WHEN close_time > NOW() THEN 0 ELSE 1 END,
           close_time DESC
         LIMIT 1`,
    giveawayNum ? [giveawayNum] : []
  )

  if (!giveaway) {
    return { charityStats: [], totalTickets: 0 }
  }

  // Get ticket stats per charity for this giveaway
  const charityStats = await pg.manyOrNone<{
    charity_id: string
    total_tickets: string
    total_mana_spent: string
  }>(
    `SELECT 
       charity_id,
       SUM(num_tickets) as total_tickets,
       SUM(mana_spent) as total_mana_spent
     FROM charity_giveaway_tickets
     WHERE giveaway_num = $1
     GROUP BY charity_id
     ORDER BY total_tickets DESC`,
    [giveaway.giveaway_num]
  )

  const totalTickets = charityStats.reduce(
    (sum, s) => sum + parseFloat(s.total_tickets),
    0
  )

  return {
    giveaway: {
      giveawayNum: giveaway.giveaway_num,
      name: giveaway.name,
      prizeAmountUsd: giveaway.prize_amount_usd,
      closeTime: tsToMillis(giveaway.close_time),
      winningTicketId: giveaway.winning_ticket_id,
      createdTime: tsToMillis(giveaway.created_time),
    },
    charityStats: charityStats.map((s) => ({
      charityId: s.charity_id,
      totalTickets: parseFloat(s.total_tickets),
      totalManaSpent: parseFloat(s.total_mana_spent),
    })),
    totalTickets,
  }
}
