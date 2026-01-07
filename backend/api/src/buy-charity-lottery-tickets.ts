import { APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { getUser } from 'shared/utils'
import { charities } from 'common/charity'
import { calculateLotteryTicketCost } from 'common/charity-lottery'

export const buyCharityLotteryTickets: APIHandler<
  'buy-charity-lottery-tickets'
> = async (props, auth) => {
  const { lotteryNum, charityId, numTickets } = props

  // Validate charity exists
  const charity = charities.find((c) => c.id === charityId)
  if (!charity) {
    throw new APIError(404, 'Charity not found')
  }

  const pg = createSupabaseDirectClient()

  return await pg.tx(async (tx) => {
    // Get lottery and verify it's still open
    const lottery = await tx.oneOrNone<{
      lottery_num: number
      close_time: string
    }>(`SELECT lottery_num, close_time FROM charity_lotteries WHERE lottery_num = $1`, [
      lotteryNum,
    ])

    if (!lottery) {
      throw new APIError(404, 'Lottery not found')
    }

    if (new Date(lottery.close_time) <= new Date()) {
      throw new APIError(400, 'Lottery has closed')
    }

    // Get total ticket count across ALL charities in this lottery (for bonding curve)
    const ticketStats = await tx.oneOrNone<{ total_tickets: string }>(
      `SELECT COALESCE(SUM(num_tickets), 0) as total_tickets 
       FROM charity_lottery_tickets 
       WHERE lottery_num = $1`,
      [lotteryNum]
    )
    const currentTickets = parseFloat(ticketStats?.total_tickets ?? '0')

    // Calculate cost
    const manaSpent = calculateLotteryTicketCost(currentTickets, numTickets)

    // Check user balance
    const user = await getUser(auth.uid, tx)
    if (!user) {
      throw new APIError(404, 'User not found')
    }
    if (user.balance < manaSpent) {
      throw new APIError(403, 'Insufficient mana balance')
    }

    // Insert ticket purchase record
    const ticketRow = await tx.one<{ id: string }>(
      `INSERT INTO charity_lottery_tickets (lottery_num, charity_id, user_id, num_tickets, mana_spent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [lotteryNum, charityId, auth.uid, numTickets, manaSpent]
    )

    // Create transaction to deduct mana
    const txn = {
      category: 'CHARITY_LOTTERY_TICKET',
      fromType: 'USER',
      fromId: auth.uid,
      toType: 'BANK',
      toId: 'BANK',
      amount: manaSpent,
      token: 'M$',
      data: {
        lotteryNum,
        charityId,
        numTickets,
        ticketId: ticketRow.id,
      },
    } as const

    await runTxnInBetQueue(tx, txn)

    return {
      ticketId: ticketRow.id,
      numTickets,
      manaSpent,
    }
  })
}
