import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { tsToMillis } from 'common/supabase/utils'
import { createHash } from 'crypto'

export const getCharityGiveaway: APIHandler<'get-charity-giveaway'> = async (
  props
) => {
  const { giveawayNum } = props
  const pg = createSupabaseDirectClient()

  // If no giveawayNum specified, get the most recent active giveaway (not yet closed)
  // or the most recent giveaway overall
  const giveaway = await pg.oneOrNone<{
    giveaway_num: number
    name: string
    prize_amount_usd: number
    close_time: string
    winning_ticket_id: string | null
    nonce: string
    created_time: string
  }>(
    giveawayNum
      ? `SELECT * FROM charity_giveaways WHERE giveaway_num = $1`
      : `SELECT * FROM charity_giveaways 
         ORDER BY 
           CASE WHEN close_time > NOW() THEN 0 ELSE 1 END,
           close_time DESC
         LIMIT 1`,
    giveawayNum ? [giveawayNum] : []
  )

  if (!giveaway) {
    return { charityStats: [], totalTickets: 0 }
  }

  // Calculate MD5 hash of the nonce for provably fair verification
  // IMPORTANT: Only reveal the actual nonce AFTER the winner is selected.
  // Before that, only the hash should be shared so users can record it for verification.
  const nonceHash = createHash('md5').update(giveaway.nonce).digest('hex')

  // Get ticket stats per charity for this giveaway
  const charityStats = await pg.manyOrNone<{
    charity_id: string
    total_tickets: string
    total_mana_spent: string
  }>(
    `SELECT 
       charity_id,
       SUM(num_tickets) as total_tickets,
       SUM(mana_spent) as total_mana_spent
     FROM charity_giveaway_tickets
     WHERE giveaway_num = $1
     GROUP BY charity_id
     ORDER BY total_tickets DESC`,
    [giveaway.giveaway_num]
  )

  const totalTickets = charityStats.reduce(
    (sum, s) => sum + parseFloat(s.total_tickets),
    0
  )

  // If there's a winning ticket, get the winner details
  let winningCharity: string | undefined
  let winner:
    | { id: string; username: string; name: string; avatarUrl: string }
    | undefined

  if (giveaway.winning_ticket_id) {
    const winningTicket = await pg.oneOrNone<{
      charity_id: string
      user_id: string
    }>(
      `SELECT charity_id, user_id FROM charity_giveaway_tickets WHERE id = $1`,
      [giveaway.winning_ticket_id]
    )

    if (winningTicket) {
      winningCharity = winningTicket.charity_id

      const winnerUser = await pg.oneOrNone<{
        id: string
        username: string
        name: string
        avatar_url: string
      }>(
        `SELECT id, username, name, data->>'avatarUrl' as avatar_url FROM users WHERE id = $1`,
        [winningTicket.user_id]
      )

      if (winnerUser) {
        winner = {
          id: winnerUser.id,
          username: winnerUser.username,
          name: winnerUser.name,
          avatarUrl: winnerUser.avatar_url,
        }
      }
    }
  }

  return {
    giveaway: {
      giveawayNum: giveaway.giveaway_num,
      name: giveaway.name,
      prizeAmountUsd: giveaway.prize_amount_usd,
      closeTime: tsToMillis(giveaway.close_time),
      winningTicketId: giveaway.winning_ticket_id,
      createdTime: tsToMillis(giveaway.created_time),
    },
    charityStats: charityStats.map((s) => ({
      charityId: s.charity_id,
      totalTickets: parseFloat(s.total_tickets),
      totalManaSpent: parseFloat(s.total_mana_spent),
    })),
    totalTickets,
    winningCharity,
    winner,
    // Provably fair: always share hash, only reveal nonce AFTER winner is selected
    nonceHash,
    nonce: giveaway.winning_ticket_id ? giveaway.nonce : undefined,
  }
}
