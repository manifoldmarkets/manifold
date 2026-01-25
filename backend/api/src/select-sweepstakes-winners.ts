import { APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'
import { createHash } from 'crypto'
import {
  SweepstakesPrize,
  getTotalWinnerCount,
  getPrizeForRank,
} from 'common/sweepstakes'

export const selectSweepstakesWinners: APIHandler<
  'select-sweepstakes-winners'
> = async (props, auth) => {
  // Admin-only check
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can select sweepstakes winners')
  }

  const { sweepstakesNum } = props
  const pg = createSupabaseDirectClient()

  return await pg.tx(async (tx) => {
    // Get sweepstakes and verify it's closed and has no winners yet
    const sweepstakes = await tx.oneOrNone<{
      sweepstakes_num: number
      close_time: string
      winning_ticket_ids: string[] | null
      nonce: string
      prizes: SweepstakesPrize[]
    }>(
      `SELECT sweepstakes_num, close_time, winning_ticket_ids, nonce, prizes 
       FROM sweepstakes 
       WHERE sweepstakes_num = $1 
       FOR UPDATE`,
      [sweepstakesNum]
    )

    if (!sweepstakes) {
      throw new APIError(404, 'Sweepstakes not found')
    }

    if (new Date(sweepstakes.close_time) > new Date()) {
      throw new APIError(400, 'Sweepstakes has not closed yet')
    }

    if (
      sweepstakes.winning_ticket_ids &&
      sweepstakes.winning_ticket_ids.length > 0
    ) {
      throw new APIError(400, 'Winners have already been selected')
    }

    // Get all tickets with their cumulative ticket counts
    const tickets = await tx.manyOrNone<{
      id: string
      user_id: string
      num_tickets: string
    }>(
      `SELECT id, user_id, num_tickets 
       FROM sweepstakes_tickets 
       WHERE sweepstakes_num = $1 
       ORDER BY created_time ASC`,
      [sweepstakesNum]
    )

    if (tickets.length === 0) {
      throw new APIError(400, 'No tickets have been purchased')
    }

    // Calculate total tickets
    let totalTickets = 0
    const ticketRanges: {
      id: string
      userId: string
      start: number
      end: number
    }[] = []

    for (const ticket of tickets) {
      const numTickets = parseFloat(ticket.num_tickets)
      ticketRanges.push({
        id: ticket.id,
        userId: ticket.user_id,
        start: totalTickets,
        end: totalTickets + numTickets,
      })
      totalTickets += numTickets
    }

    // Get the last 10 tickets' timestamps for provably fair seeding
    const lastTickets = await tx.manyOrNone<{ created_time: string }>(
      `SELECT created_time FROM sweepstakes_tickets 
       WHERE sweepstakes_num = $1 
       ORDER BY created_time DESC 
       LIMIT 10`,
      [sweepstakesNum]
    )

    // Create seed by XOR-ing nonce with all ticket timestamps
    const nonceBuffer = Buffer.from(sweepstakes.nonce, 'hex')
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

    // Determine how many winners we need
    const numWinners = getTotalWinnerCount(sweepstakes.prizes)

    // Select winners iteratively
    const winningTicketIds: string[] = []
    const winners: {
      rank: number
      label: string
      prizeUsdc: number
      ticketId: string
      userId: string
    }[] = []

    // Track which tickets have already won (by ticket ID)
    const wonTicketIds = new Set<string>()

    for (let rank = 1; rank <= numWinners; rank++) {
      // Calculate remaining tickets (excluding already won tickets)
      let remainingTotal = 0
      const remainingRanges: typeof ticketRanges = []

      for (const range of ticketRanges) {
        if (!wonTicketIds.has(range.id)) {
          remainingRanges.push({
            ...range,
            start: remainingTotal,
            end: remainingTotal + (range.end - range.start),
          })
          remainingTotal += range.end - range.start
        }
      }

      if (remainingRanges.length === 0 || remainingTotal === 0) {
        break // No more tickets available
      }

      // Create deterministic random value using SHA256 hash of seed + rank
      const hash = createHash('sha256')
        .update(new Uint8Array(seedBuffer))
        .update(new Uint8Array(nonceBuffer))
        .update(Buffer.from([rank])) // Include rank to get different value for each winner
        .digest()

      // Convert first 8 bytes of hash to a number between 0 and 1
      const randomValue =
        Number(hash.readBigUInt64BE(0)) / Number(BigInt(2) ** BigInt(64))
      const winningTicketNumber = randomValue * remainingTotal

      // Find the winning ticket
      let winningTicket: (typeof remainingRanges)[0] | null = null

      for (const range of remainingRanges) {
        if (
          winningTicketNumber >= range.start &&
          winningTicketNumber < range.end
        ) {
          winningTicket = range
          break
        }
      }

      // Edge case: if we somehow didn't find one, use the last ticket
      if (!winningTicket) {
        winningTicket = remainingRanges[remainingRanges.length - 1]
      }

      // Mark this ticket as won
      wonTicketIds.add(winningTicket.id)
      winningTicketIds.push(winningTicket.id)

      // Get prize info for this rank
      const prize = getPrizeForRank(sweepstakes.prizes, rank)

      winners.push({
        rank,
        label: prize?.label ?? `${rank}${getOrdinalSuffix(rank)}`,
        prizeUsdc: prize?.amountUsdc ?? 0,
        ticketId: winningTicket.id,
        userId: winningTicket.userId,
      })
    }

    // Update the sweepstakes with the winning ticket IDs
    await tx.none(
      `UPDATE sweepstakes 
       SET winning_ticket_ids = $1 
       WHERE sweepstakes_num = $2`,
      [winningTicketIds, sweepstakesNum]
    )

    return { winners }
  })
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}
