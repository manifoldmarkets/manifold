import { APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { getUser } from 'shared/utils'
import { charities } from 'common/charity'
import { calculateGiveawayTicketCost } from 'common/charity-giveaway'

export const buyCharityGiveawayTickets: APIHandler<
  'buy-charity-giveaway-tickets'
> = async (props, auth) => {
  const { giveawayNum, charityId, numTickets } = props

  // Validate charity exists
  const charity = charities.find((c) => c.id === charityId)
  if (!charity) {
    throw new APIError(404, 'Charity not found')
  }

  const pg = createSupabaseDirectClient()

  return await pg.tx(async (tx) => {
    // Get giveaway and verify it's still open
    const giveaway = await tx.oneOrNone<{
      giveaway_num: number
      close_time: string
    }>(
      `SELECT giveaway_num, close_time FROM charity_giveaways WHERE giveaway_num = $1`,
      [giveawayNum]
    )

    if (!giveaway) {
      throw new APIError(404, 'Giveaway not found')
    }

    if (new Date(giveaway.close_time) <= new Date()) {
      throw new APIError(400, 'Giveaway has closed')
    }

    // Get total ticket count across ALL charities in this giveaway (for bonding curve)
    const ticketStats = await tx.oneOrNone<{ total_tickets: string }>(
      `SELECT COALESCE(SUM(num_tickets), 0) as total_tickets 
       FROM charity_giveaway_tickets 
       WHERE giveaway_num = $1`,
      [giveawayNum]
    )
    const currentTickets = parseFloat(ticketStats?.total_tickets ?? '0')

    // Calculate cost
    const manaSpent = calculateGiveawayTicketCost(currentTickets, numTickets)

    // Minimum purchase of 1 mana
    if (manaSpent < 1) {
      throw new APIError(400, 'Minimum purchase is 1 mana')
    }

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
      `INSERT INTO charity_giveaway_tickets (giveaway_num, charity_id, user_id, num_tickets, mana_spent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [giveawayNum, charityId, auth.uid, numTickets, manaSpent]
    )

    // Create transaction to deduct mana
    const txn = {
      category: 'CHARITY_GIVEAWAY_TICKET',
      fromType: 'USER',
      fromId: auth.uid,
      toType: 'BANK',
      toId: 'BANK',
      amount: manaSpent,
      token: 'M$',
      data: {
        giveawayNum,
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
