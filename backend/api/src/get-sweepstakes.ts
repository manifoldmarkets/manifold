import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { tsToMillis } from 'common/supabase/utils'
import { createHash } from 'crypto'
import {
  SweepstakesPrize,
  getPrizeForRank,
  SweepstakesWinner,
} from 'common/sweepstakes'

export const getSweepstakes: APIHandler<'get-sweepstakes'> = async (
  props,
  auth
) => {
  const { sweepstakesNum } = props
  const pg = createSupabaseDirectClient()

  // If no sweepstakesNum specified, get the most recent active sweepstakes (not yet closed)
  // or the most recent sweepstakes overall
  const sweepstakes = await pg.oneOrNone<{
    sweepstakes_num: number
    name: string
    prizes: SweepstakesPrize[]
    close_time: string
    winning_ticket_ids: string[] | null
    nonce: string
    created_time: string
  }>(
    sweepstakesNum
      ? `SELECT * FROM sweepstakes WHERE sweepstakes_num = $1`
      : `SELECT * FROM sweepstakes 
         ORDER BY 
           CASE WHEN close_time > NOW() THEN 0 ELSE 1 END,
           close_time DESC
         LIMIT 1`,
    sweepstakesNum ? [sweepstakesNum] : []
  )

  if (!sweepstakes) {
    return { userStats: [], totalTickets: 0 }
  }

  // Calculate MD5 hash of the nonce for provably fair verification
  // IMPORTANT: Only reveal the actual nonce AFTER the winners are selected.
  // Before that, only the hash should be shared so users can record it for verification.
  const nonceHash = createHash('md5').update(sweepstakes.nonce).digest('hex')

  // Get ticket stats per user for this sweepstakes
  const userStats = await pg.manyOrNone<{
    user_id: string
    total_tickets: string
    total_mana_spent: string
  }>(
    `SELECT 
       user_id,
       SUM(num_tickets) as total_tickets,
       SUM(mana_spent) as total_mana_spent
     FROM sweepstakes_tickets
     WHERE sweepstakes_num = $1
     GROUP BY user_id
     ORDER BY total_tickets DESC`,
    [sweepstakes.sweepstakes_num]
  )

  const totalTickets = userStats.reduce(
    (sum, s) => sum + parseFloat(s.total_tickets),
    0
  )

  // If there are winning tickets, get the winner details
  let winners: SweepstakesWinner[] | undefined

  if (
    sweepstakes.winning_ticket_ids &&
    sweepstakes.winning_ticket_ids.length > 0
  ) {
    const winningTickets = await pg.manyOrNone<{
      id: string
      user_id: string
    }>(
      `SELECT id, user_id FROM sweepstakes_tickets WHERE id = ANY($1)`,
      [sweepstakes.winning_ticket_ids]
    )

    // Create a map for quick lookup
    const ticketMap = new Map(winningTickets.map((t) => [t.id, t]))

    // Get all unique user IDs
    const userIds = [...new Set(winningTickets.map((t) => t.user_id))]

    const users = await pg.manyOrNone<{
      id: string
      username: string
      name: string
      avatar_url: string
    }>(
      `SELECT id, username, name, data->>'avatarUrl' as avatar_url FROM users WHERE id = ANY($1)`,
      [userIds]
    )

    const userMap = new Map(users.map((u) => [u.id, u]))

    winners = []
    for (let i = 0; i < sweepstakes.winning_ticket_ids.length; i++) {
      const ticketId = sweepstakes.winning_ticket_ids[i]
      const ticket = ticketMap.get(ticketId)
      if (!ticket) continue

      const user = userMap.get(ticket.user_id)
      if (!user) continue

      const rank = i + 1
      const prize = getPrizeForRank(sweepstakes.prizes, rank)
      if (!prize) continue

      winners.push({
        rank,
        label: prize.label,
        prizeUsdc: prize.amountUsdc,
        ticketId,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          avatarUrl: user.avatar_url,
        },
      })
    }
  }

  // Check if current user has claimed free ticket
  let hasClaimedFreeTicket: boolean | undefined
  if (auth) {
    const freeTicket = await pg.oneOrNone(
      `SELECT 1 FROM sweepstakes_free_tickets WHERE sweepstakes_num = $1 AND user_id = $2`,
      [sweepstakes.sweepstakes_num, auth.uid]
    )
    hasClaimedFreeTicket = !!freeTicket
  }

  return {
    sweepstakes: {
      sweepstakesNum: sweepstakes.sweepstakes_num,
      name: sweepstakes.name,
      prizes: sweepstakes.prizes,
      closeTime: tsToMillis(sweepstakes.close_time),
      winningTicketIds: sweepstakes.winning_ticket_ids,
      createdTime: tsToMillis(sweepstakes.created_time),
    },
    userStats: userStats.map((s) => ({
      userId: s.user_id,
      totalTickets: parseFloat(s.total_tickets),
      totalManaSpent: parseFloat(s.total_mana_spent),
    })),
    totalTickets,
    winners,
    // Provably fair: always share hash, only reveal nonce AFTER winners are selected
    nonceHash,
    nonce:
      sweepstakes.winning_ticket_ids &&
      sweepstakes.winning_ticket_ids.length > 0
        ? sweepstakes.nonce
        : undefined,
    hasClaimedFreeTicket,
  }
}
