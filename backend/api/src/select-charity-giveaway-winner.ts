import { APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient, SERIAL_MODE } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'
import { createHash } from 'crypto'
import { getFirstBlockAfter } from 'common/bitcoin'

export const selectCharityGiveawayWinner: APIHandler<
  'select-charity-giveaway-winner'
> = async (props, auth) => {
  const toMillis = (timestamp: string | Date) =>
    timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()

  // Admin-only check
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can select the giveaway winner')
  }

  const { giveawayNum } = props
  const pg = createSupabaseDirectClient()

  return await pg.tx({ mode: SERIAL_MODE }, async (tx) => {
    // Get giveaway and verify it's closed and has no winner yet
    const giveaway = await tx.oneOrNone<{
      giveaway_num: number
      close_time: string | Date
      winning_ticket_id: string | null
      db_now: string | Date
    }>(
      `SELECT giveaway_num, close_time, winning_ticket_id, NOW() AS db_now
       FROM charity_giveaways 
       WHERE giveaway_num = $1 
       FOR UPDATE`,
      [giveawayNum]
    )

    if (!giveaway) {
      throw new APIError(404, 'Giveaway not found')
    }

    if (toMillis(giveaway.close_time) > toMillis(giveaway.db_now)) {
      throw new APIError(400, 'Giveaway has not closed yet')
    }

    if (giveaway.winning_ticket_id) {
      throw new APIError(400, 'Winner has already been selected')
    }

    // Get total tickets
    const totalStats = await tx.oneOrNone<{ total_tickets: string }>(
      `SELECT COALESCE(SUM(num_tickets), 0) as total_tickets 
       FROM charity_giveaway_tickets 
       WHERE giveaway_num = $1`,
      [giveawayNum]
    )

    const totalTickets = parseFloat(totalStats?.total_tickets ?? '0')

    if (totalTickets === 0) {
      throw new APIError(400, 'No tickets have been purchased')
    }

    // Get the first Bitcoin block mined after close_time for provably fair seeding
    const closeTimeSeconds = Math.floor(toMillis(giveaway.close_time) / 1000)
    const block = await getFirstBlockAfter(closeTimeSeconds)
    const blockHash = block.id

    // Create deterministic random value using SHA256 hash of blockHash
    const hash = createHash('sha256').update(blockHash).digest()

    // Convert first 8 bytes of hash to a number between 0 and 1
    const randomValue =
      Number(hash.readBigUInt64BE(0)) / Number(BigInt(2) ** BigInt(64))
    const winningTicketNumber = randomValue * totalTickets

    // Walk through tickets to find the winner
    // We iterate through all ticket purchases, accumulating num_tickets until we pass the winning number
    const tickets = await tx.manyOrNone<{
      id: string
      charity_id: string
      user_id: string
      num_tickets: string
    }>(
      `SELECT id, charity_id, user_id, num_tickets 
       FROM charity_giveaway_tickets 
       WHERE giveaway_num = $1 
       ORDER BY created_time ASC, id ASC`,
      [giveawayNum]
    )

    let accumulatedTickets = 0
    let winningTicket: {
      id: string
      charityId: string
      userId: string
    } | null = null

    for (const ticket of tickets) {
      accumulatedTickets += parseFloat(ticket.num_tickets)
      if (accumulatedTickets > winningTicketNumber) {
        winningTicket = {
          id: ticket.id,
          charityId: ticket.charity_id,
          userId: ticket.user_id,
        }
        break
      }
    }

    if (!winningTicket) {
      // Edge case: if we get here, use the last ticket
      const lastTicket = tickets[tickets.length - 1]
      winningTicket = {
        id: lastTicket.id,
        charityId: lastTicket.charity_id,
        userId: lastTicket.user_id,
      }
    }

    // Update the giveaway with the winning ticket and Bitcoin block hash
    await tx.none(
      `UPDATE charity_giveaways 
       SET winning_ticket_id = $1, nonce = $2
       WHERE giveaway_num = $3`,
      [winningTicket.id, blockHash, giveawayNum]
    )

    return {
      ticketId: winningTicket.id,
      charityId: winningTicket.charityId,
      userId: winningTicket.userId,
      blockHash,
      blockHeight: block.height,
    }
  })
}
