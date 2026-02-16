import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { tsToMillis } from 'common/supabase/utils'
import { createHash } from 'crypto'
import { CHARITY_CHAMPION_ENTITLEMENT_ID } from 'common/shop/items'

export const getCharityGiveaway: APIHandler<'get-charity-giveaway'> = async (
  props
) => {
  const { giveawayNum, userId } = props
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
  const [charityStats, topUsersData, yourEntryData, trophyHolderData, winnerData] =
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

      // Get top 3 ticket holders with user info
      pg.manyOrNone<{
        user_id: string
        total_tickets: string
        username: string
        name: string
        avatar_url: string
        rank: string
      }>(
        `SELECT t.user_id, t.total_tickets, u.username, u.name, u.data->>'avatarUrl' as avatar_url, t.rank
         FROM (
           SELECT user_id, SUM(num_tickets) as total_tickets,
                  ROW_NUMBER() OVER (ORDER BY SUM(num_tickets) DESC) as rank
           FROM charity_giveaway_tickets
           WHERE giveaway_num = $1
           GROUP BY user_id
           ORDER BY total_tickets DESC
           LIMIT 3
         ) t
         JOIN users u ON u.id = t.user_id`,
        [giveaway.giveaway_num]
      ),

      // Get the requesting user's rank and tickets (if userId provided)
      userId
        ? pg.oneOrNone<{ rank: string; total_tickets: string }>(
            `SELECT rank, total_tickets FROM (
               SELECT user_id, SUM(num_tickets) as total_tickets,
                      ROW_NUMBER() OVER (ORDER BY SUM(num_tickets) DESC) as rank
               FROM charity_giveaway_tickets
               WHERE giveaway_num = $1
               GROUP BY user_id
             ) ranked
             WHERE user_id = $2`,
            [giveaway.giveaway_num, userId]
          )
        : Promise.resolve(null),

      // Get trophy holder (only one row can exist since old holders are deleted)
      pg.oneOrNone<{
        user_id: string
        granted_time: string
        username: string
        name: string
        avatar_url: string
        total_tickets: string | null
        metadata: { previousHolderId?: string; previousHolderClaimedAt?: string } | null
      }>(
        `SELECT
           ue.user_id,
           ue.granted_time,
           u.username,
           u.name,
           u.data->>'avatarUrl' as avatar_url,
           ue.metadata,
           (SELECT SUM(num_tickets) FROM charity_giveaway_tickets
            WHERE giveaway_num = $1 AND user_id = ue.user_id) as total_tickets
         FROM user_entitlements ue
         JOIN users u ON u.id = ue.user_id
         WHERE ue.entitlement_id = $2
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

  // Build champion object (top user)
  const firstPlace = topUsersData?.[0]
  const champion = firstPlace
    ? {
        id: firstPlace.user_id,
        username: firstPlace.username,
        name: firstPlace.name,
        avatarUrl: firstPlace.avatar_url,
        totalTickets: parseFloat(firstPlace.total_tickets),
      }
    : undefined

  // Build top users leaderboard
  const topUsers = topUsersData?.length
    ? topUsersData.map((u) => ({
        id: u.user_id,
        username: u.username,
        name: u.name,
        avatarUrl: u.avatar_url,
        totalTickets: parseFloat(u.total_tickets),
        rank: parseInt(u.rank),
      }))
    : undefined

  // Build viewer's entry
  const yourEntry = yourEntryData
    ? {
        rank: parseInt(yourEntryData.rank),
        totalTickets: parseFloat(yourEntryData.total_tickets),
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

  // Build previous holder from current holder's metadata
  const previousHolderId = trophyHolderData?.metadata?.previousHolderId
  const previousHolderUser = previousHolderId
    ? await pg.oneOrNone<{
        username: string
        name: string
        avatar_url: string
      }>(
        `SELECT username, name, data->>'avatarUrl' as avatar_url
         FROM users WHERE id = $1`,
        [previousHolderId]
      )
    : null

  const previousTrophyHolder =
    previousHolderId && previousHolderUser
      ? {
          id: previousHolderId,
          username: previousHolderUser.username,
          name: previousHolderUser.name,
          avatarUrl: previousHolderUser.avatar_url,
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
    topUsers,
    yourEntry,
    trophyHolder,
    previousTrophyHolder,
    // Provably fair: always share hash, only reveal nonce AFTER winner is selected
    nonceHash,
    nonce: giveaway.winning_ticket_id ? giveaway.nonce : undefined,
  }
}
