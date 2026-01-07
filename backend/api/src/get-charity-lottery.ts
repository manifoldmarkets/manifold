import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { tsToMillis } from 'common/supabase/utils'

export const getCharityLottery: APIHandler<'get-charity-lottery'> = async (
  props
) => {
  const { lotteryNum } = props
  const pg = createSupabaseDirectClient()

  // If no lotteryNum specified, get the most recent active lottery (not yet closed)
  // or the most recent lottery overall
  const lottery = await pg.oneOrNone<{
    lottery_num: number
    name: string
    prize_amount_usd: number
    close_time: string
    winning_ticket_id: string | null
    created_time: string
  }>(
    lotteryNum
      ? `SELECT * FROM charity_lotteries WHERE lottery_num = $1`
      : `SELECT * FROM charity_lotteries 
         ORDER BY 
           CASE WHEN close_time > NOW() THEN 0 ELSE 1 END,
           close_time DESC
         LIMIT 1`,
    lotteryNum ? [lotteryNum] : []
  )

  if (!lottery) {
    return { charityStats: [], totalTickets: 0 }
  }

  // Get ticket stats per charity for this lottery
  const charityStats = await pg.manyOrNone<{
    charity_id: string
    total_tickets: string
    total_mana_spent: string
  }>(
    `SELECT 
       charity_id,
       SUM(num_tickets) as total_tickets,
       SUM(mana_spent) as total_mana_spent
     FROM charity_lottery_tickets
     WHERE lottery_num = $1
     GROUP BY charity_id
     ORDER BY total_tickets DESC`,
    [lottery.lottery_num]
  )

  const totalTickets = charityStats.reduce(
    (sum, s) => sum + parseFloat(s.total_tickets),
    0
  )

  return {
    lottery: {
      lotteryNum: lottery.lottery_num,
      name: lottery.name,
      prizeAmountUsd: lottery.prize_amount_usd,
      closeTime: tsToMillis(lottery.close_time),
      winningTicketId: lottery.winning_ticket_id,
      createdTime: tsToMillis(lottery.created_time),
    },
    charityStats: charityStats.map((s) => ({
      charityId: s.charity_id,
      totalTickets: parseFloat(s.total_tickets),
      totalManaSpent: parseFloat(s.total_mana_spent),
    })),
    totalTickets,
  }
}
