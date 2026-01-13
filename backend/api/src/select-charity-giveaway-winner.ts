import { APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'
import { createHash } from 'crypto'

export const selectCharityGiveawayWinner: APIHandler<
  'select-charity-giveaway-winner'
> = async (props, auth) => {
  // Admin-only check
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can select the giveaway winner')
  }

  const { giveawayNum } = props
  const pg = createSupabaseDirectClient()

  return await pg.tx(async (tx) => {
    // Get giveaway and verify it's closed and has no winner yet
    // Note: nonce is secret until winner is selected, then revealed for verification
    const giveaway = await tx.oneOrNone<{
      giveaway_num: number
      close_time: string
      winning_ticket_id: string | null
      nonce: string
    }>(
      `SELECT giveaway_num, close_time, winning_ticket_id, nonce 
       FROM charity_giveaways 
       WHERE giveaway_num = $1 
       FOR UPDATE`,
      [giveawayNum]
    )

    if (!giveaway) {
      throw new APIError(404, 'Giveaway not found')
    }

    if (new Date(giveaway.close_time) > new Date()) {
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

    // Get the last 10 tickets' timestamps for provably fair seeding
    // Using multiple timestamps makes it impossible for any single buyer to manipulate the outcome
    const lastTickets = await tx.manyOrNone<{ created_time: string }>(
      `SELECT created_time FROM charity_giveaway_tickets 
       WHERE giveaway_num = $1 
       ORDER BY created_time DESC 
       LIMIT 10`,
      [giveawayNum]
    )

    // Create seed by XOR-ing nonce with all ticket timestamps
    const nonceBuffer = Buffer.from(giveaway.nonce, 'hex')
    const seedBuffer = Buffer.alloc(8)

    // Start with first 8 bytes of nonce
    for (let i = 0; i < 8; i++) {
      seedBuffer[i] = nonceBuffer[i]
    }

    // XOR each ticket's timestamp into the seed
    for (const ticket of lastTickets) {
      const timestamp = new Date(ticket.created_time).getTime()
      const timestampBuffer = Buffer.alloc(8)
      timestampBuffer.writeBigInt64BE(BigInt(timestamp))

      for (let i = 0; i < 8; i++) {
        seedBuffer[i] ^= timestampBuffer[i]
      }
    }

    // Create deterministic random value using SHA256 hash of seed
    const hash = createHash('sha256')
      .update(new Uint8Array(seedBuffer))
      .update(new Uint8Array(nonceBuffer)) // Include full nonce for more entropy
      .digest()

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
       ORDER BY created_time ASC`,
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

    // Update the giveaway with the winning ticket
    await tx.none(
      `UPDATE charity_giveaways 
       SET winning_ticket_id = $1 
       WHERE giveaway_num = $2`,
      [winningTicket.id, giveawayNum]
    )

    return {
      ticketId: winningTicket.id,
      charityId: winningTicket.charityId,
      userId: winningTicket.userId,
    }
  })
}
