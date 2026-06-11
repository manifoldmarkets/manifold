import { APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { getUser } from 'shared/utils'
import {
  calculateSweepstakesTicketCost,
  calculateSweepstakesTicketsFromMana,
  getTotalPrizePool,
  SWEEPSTAKES_MIN_MANA_INVESTED,
  SweepstakesPrize,
} from 'common/sweepstakes'
import { getIp } from 'shared/analytics'
import { isSweepstakesLocationAllowed } from 'shared/ip-geolocation'
import { canEnterPrizeDrawings } from 'common/user'
import { isAdminId } from 'common/envs/constants'

export const buySweepstakesTickets: APIHandler<
  'buy-sweepstakes-tickets'
> = async (props, auth, req) => {
  const { sweepstakesNum, maxManaSpent } = props
  let { numTickets } = props

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
      prizes: SweepstakesPrize[]
    }>(
      `SELECT sweepstakes_num, close_time, prizes
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

    // Get total ticket count for this sweepstakes (for bonding curve).
    // Filter voided_at IS NULL so refunded entries don't push the curve
    // higher for the next buyer — voiding removes mana from the pool, so
    // pricing should match.
    const ticketStats = await tx.oneOrNone<{ total_tickets: string }>(
      `SELECT COALESCE(SUM(num_tickets), 0) as total_tickets
         FROM sweepstakes_tickets
         WHERE sweepstakes_num = $1
           AND voided_at IS NULL`,
      [sweepstakesNum]
    )
    const currentTickets = parseFloat(ticketStats?.total_tickets ?? '0')

    // Calculate cost. If the caller provided a mana budget, compute the
    // number of entries using the latest ticket count so concurrent purchases
    // cannot make us spend more mana than the user confirmed in the UI.
    // If both numTickets and maxManaSpent are provided, take the lesser
    // ticket count (i.e. whichever constraint is tighter).
    const totalPrizeUsd = getTotalPrizePool(sweepstakes.prizes)

    if (maxManaSpent) {
      const ticketsFromMana = calculateSweepstakesTicketsFromMana(
        currentTickets,
        maxManaSpent,
        totalPrizeUsd
      )
      // If both are provided, use the lesser ticket count
      numTickets = numTickets
        ? Math.min(numTickets, ticketsFromMana)
        : ticketsFromMana
    }

    if (!numTickets || numTickets <= 0) {
      throw new APIError(
        400,
        maxManaSpent
          ? 'Insufficient mana for any entries at the current price'
          : 'Ticket quantity must be positive'
      )
    }

    // Always recalculate manaSpent from the final numTickets so the user
    // is charged the exact cost (never more than maxManaSpent).
    let manaSpent = calculateSweepstakesTicketCost(
      currentTickets,
      numTickets,
      totalPrizeUsd
    )
    if (maxManaSpent && manaSpent > maxManaSpent) {
      manaSpent = maxManaSpent
    }

    // Check user balance and eligibility
    const user = await getUser(auth.uid, tx)
    if (!user) {
      throw new APIError(404, 'User not found')
    }
    if (isAdminId(user.id)) {
      throw new APIError(403, 'Admins cannot participate in the sweepstakes')
    }
    if (!canEnterPrizeDrawings(user)) {
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
