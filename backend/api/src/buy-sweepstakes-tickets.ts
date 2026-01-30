import { APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { getUser } from 'shared/utils'
import {
  calculateSweepstakesTicketCost,
  SWEEPSTAKES_MIN_MANA_INVESTED,
} from 'common/sweepstakes'
import { getIp } from 'shared/analytics'
import { isSweepstakesLocationAllowed } from 'shared/ip-geolocation'
import { canReceiveBonuses } from 'common/user'

export const buySweepstakesTickets: APIHandler<'buy-sweepstakes-tickets'> =
  async (props, auth, req) => {
    const { sweepstakesNum, numTickets } = props

    // Geofencing check
    const ip = getIp(req)
    const { allowed } = await isSweepstakesLocationAllowed(ip)
    if (!allowed) {
      throw new APIError(403, 'Sweepstakes is not available in your region')
    }

    const pg = createSupabaseDirectClient()

    return await pg.tx(async (tx) => {
      // Get sweepstakes and verify it's still open
      const sweepstakes = await tx.oneOrNone<{
        sweepstakes_num: number
        close_time: string
      }>(
        `SELECT sweepstakes_num, close_time
         FROM sweepstakes
         WHERE sweepstakes_num = $1
         FOR UPDATE`,
        [sweepstakesNum]
      )

      if (!sweepstakes) {
        throw new APIError(404, 'Sweepstakes not found')
      }

      if (new Date(sweepstakes.close_time) <= new Date()) {
        throw new APIError(400, 'Sweepstakes has closed')
      }

      // Get total ticket count for this sweepstakes (for bonding curve)
      const ticketStats = await tx.oneOrNone<{ total_tickets: string }>(
        `SELECT COALESCE(SUM(num_tickets), 0) as total_tickets 
         FROM sweepstakes_tickets 
         WHERE sweepstakes_num = $1`,
        [sweepstakesNum]
      )
      const currentTickets = parseFloat(ticketStats?.total_tickets ?? '0')

      // Calculate cost
      const manaSpent = calculateSweepstakesTicketCost(currentTickets, numTickets)

      // Check user balance and eligibility
      const user = await getUser(auth.uid, tx)
      if (!user) {
        throw new APIError(404, 'User not found')
      }
      if (!canReceiveBonuses(user)) {
        throw new APIError(
          403,
          'You must verify your identity to participate in the sweepstakes'
        )
      }

      // Check minimum mana invested requirement
      const investedResult = await tx.oneOrNone<{ total_invested: string }>(
        `SELECT COALESCE(SUM((data->>'totalAmountInvested')::numeric), 0) as total_invested
         FROM user_contract_metrics
         WHERE user_id = $1`,
        [auth.uid]
      )
      const totalManaInvested = parseFloat(investedResult?.total_invested ?? '0')
      if (totalManaInvested < SWEEPSTAKES_MIN_MANA_INVESTED) {
        throw new APIError(
          403,
          `You must have at least ${SWEEPSTAKES_MIN_MANA_INVESTED} mana invested to participate in the sweepstakes`
        )
      }

      if (user.balance < manaSpent) {
        throw new APIError(403, 'Insufficient mana balance')
      }

      // Insert ticket purchase record
      const ticketRow = await tx.one<{ id: string }>(
        `INSERT INTO sweepstakes_tickets (sweepstakes_num, user_id, num_tickets, mana_spent, is_free)
         VALUES ($1, $2, $3, $4, false)
         RETURNING id`,
        [sweepstakesNum, auth.uid, numTickets, manaSpent]
      )

      // Create transaction to deduct mana
      const txn = {
        category: 'SWEEPSTAKES_TICKET',
        fromType: 'USER',
        fromId: auth.uid,
        toType: 'BANK',
        toId: 'BANK',
        amount: manaSpent,
        token: 'M$',
        data: {
          sweepstakesNum,
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
