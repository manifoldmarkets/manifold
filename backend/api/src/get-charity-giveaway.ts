import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { tsToMillis } from 'common/supabase/utils'
import { createHash } from 'crypto'
import { CHARITY_CHAMPION_ENTITLEMENT_ID } from 'common/shop/items'

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

  // Run all queries in parallel for better performance (single round trip)
  const [charityStats, championData, trophyHolderData, winnerData] =
    await Promise.all([
      // Get ticket stats per charity
      pg.manyOrNone<{
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
      ),

      // Get champion (top ticket holder) with user info in one query
      pg.oneOrNone<{
        user_id: string
        total_tickets: string
        username: string
        name: string
        avatar_url: string
      }>(
        `SELECT t.user_id, t.total_tickets, u.username, u.name, u.data->>'avatarUrl' as avatar_url
         FROM (
           SELECT user_id, SUM(num_tickets) as total_tickets
           FROM charity_giveaway_tickets
           WHERE giveaway_num = $1
           GROUP BY user_id
           ORDER BY total_tickets DESC
           LIMIT 1
         ) t
         JOIN users u ON u.id = t.user_id`,
        [giveaway.giveaway_num]
      ),

      // Get trophy holder with user info AND ticket count in one query
      pg.oneOrNone<{
        user_id: string
        granted_time: string
        username: string
        name: string
        avatar_url: string
        total_tickets: string | null
      }>(
        `SELECT
           ue.user_id,
           ue.granted_time,
           u.username,
           u.name,
           u.data->>'avatarUrl' as avatar_url,
           (SELECT SUM(num_tickets) FROM charity_giveaway_tickets
            WHERE giveaway_num = $1 AND user_id = ue.user_id) as total_tickets
         FROM user_entitlements ue
         JOIN users u ON u.id = ue.user_id
         WHERE ue.entitlement_id = $2 AND ue.enabled = true
         LIMIT 1`,
        [giveaway.giveaway_num, CHARITY_CHAMPION_ENTITLEMENT_ID]
      ),

      // Get winner info if there's a winning ticket
      giveaway.winning_ticket_id
        ? pg.oneOrNone<{
            charity_id: string
            user_id: string
            username: string
            name: string
            avatar_url: string
          }>(
            `SELECT t.charity_id, t.user_id, u.username, u.name, u.data->>'avatarUrl' as avatar_url
             FROM charity_giveaway_tickets t
             JOIN users u ON u.id = t.user_id
             WHERE t.id = $1`,
            [giveaway.winning_ticket_id]
          )
        : Promise.resolve(null),
    ])

  const totalTickets = charityStats.reduce(
    (sum, s) => sum + parseFloat(s.total_tickets),
    0
  )

  // Build champion object
  const champion = championData
    ? {
        id: championData.user_id,
        username: championData.username,
        name: championData.name,
        avatarUrl: championData.avatar_url,
        totalTickets: parseFloat(championData.total_tickets),
      }
    : undefined

  // Build trophy holder object
  const trophyHolder = trophyHolderData
    ? {
        id: trophyHolderData.user_id,
        username: trophyHolderData.username,
        name: trophyHolderData.name,
        avatarUrl: trophyHolderData.avatar_url,
        totalTickets: trophyHolderData.total_tickets
          ? parseFloat(trophyHolderData.total_tickets)
          : 0,
        claimedTime: tsToMillis(trophyHolderData.granted_time),
      }
    : undefined

  // Build winner object
  const winningCharity = winnerData?.charity_id
  const winner = winnerData
    ? {
        id: winnerData.user_id,
        username: winnerData.username,
        name: winnerData.name,
        avatarUrl: winnerData.avatar_url,
      }
    : undefined

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
    champion,
    trophyHolder,
    // Provably fair: always share hash, only reveal nonce AFTER winner is selected
    nonceHash,
    nonce: giveaway.winning_ticket_id ? giveaway.nonce : undefined,
  }
}
