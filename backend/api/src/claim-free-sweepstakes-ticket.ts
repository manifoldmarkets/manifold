import { APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getIp } from 'shared/analytics'
import { isSweepstakesLocationAllowed } from 'shared/ip-geolocation'
import { getUser } from 'shared/utils'
import { canReceiveBonuses } from 'common/user'

const FREE_TICKET_AMOUNT = 1 // One free ticket per user per sweepstakes

export const claimFreeSweepstakesTicket: APIHandler<
  'claim-free-sweepstakes-ticket'
> = async (props, auth, req) => {
  const { sweepstakesNum } = props

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
      `SELECT sweepstakes_num, close_time FROM sweepstakes WHERE sweepstakes_num = $1`,
      [sweepstakesNum]
    )

    if (!sweepstakes) {
      throw new APIError(404, 'Sweepstakes not found')
    }

    if (new Date(sweepstakes.close_time) <= new Date()) {
      throw new APIError(400, 'Sweepstakes has closed')
    }

    // Check user eligibility
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

    // Check if user has already claimed free ticket
    const existingClaim = await tx.oneOrNone(
      `SELECT 1 FROM sweepstakes_free_tickets 
       WHERE sweepstakes_num = $1 AND user_id = $2`,
      [sweepstakesNum, auth.uid]
    )

    if (existingClaim) {
      throw new APIError(400, 'You have already claimed your free ticket')
    }

    // Insert the free ticket claim record
    await tx.none(
      `INSERT INTO sweepstakes_free_tickets (sweepstakes_num, user_id)
       VALUES ($1, $2)`,
      [sweepstakesNum, auth.uid]
    )

    // Insert ticket purchase record (free, so mana_spent = 0)
    const ticketRow = await tx.one<{ id: string }>(
      `INSERT INTO sweepstakes_tickets (sweepstakes_num, user_id, num_tickets, mana_spent, is_free)
       VALUES ($1, $2, $3, 0, true)
       RETURNING id`,
      [sweepstakesNum, auth.uid, FREE_TICKET_AMOUNT]
    )

    return {
      ticketId: ticketRow.id,
      numTickets: FREE_TICKET_AMOUNT,
    }
  })
}
