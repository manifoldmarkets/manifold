import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { getPrizeForRank, SweepstakesPrize } from 'common/sweepstakes'

export const adminGetPrizeClaims: APIHandler<'admin-get-prize-claims'> = async (
  body,
  auth
) => {
  // Only admins can access this endpoint
  throwErrorIfNotAdmin(auth.uid)

  const { sweepstakesNum } = body
  const pg = createSupabaseDirectClient()

  // Get all sweepstakes with winners
  const sweepstakesQuery = sweepstakesNum !== undefined
    ? `SELECT sweepstakes_num, winning_ticket_ids, prizes FROM sweepstakes WHERE sweepstakes_num = $1 AND winning_ticket_ids IS NOT NULL`
    : `SELECT sweepstakes_num, winning_ticket_ids, prizes FROM sweepstakes WHERE winning_ticket_ids IS NOT NULL ORDER BY sweepstakes_num DESC`

  const sweepstakesList = await pg.manyOrNone<{
    sweepstakes_num: number
    winning_ticket_ids: string[]
    prizes: SweepstakesPrize[]
  }>(sweepstakesQuery, sweepstakesNum !== undefined ? [sweepstakesNum] : [])

  const claims: Array<{
    id: string | null
    sweepstakesNum: number
    userId: string
    username: string
    name: string
    avatarUrl: string
    rank: number
    prizeAmountUsdc: number
    walletAddress: string | null
    paymentStatus: 'awaiting' | 'sent' | 'rejected' | null
    paymentTxnHash: string | null
    createdTime: number | null
  }> = []

  for (const sweepstakes of sweepstakesList) {
    if (!sweepstakes.winning_ticket_ids || sweepstakes.winning_ticket_ids.length === 0) {
      continue
    }

    // Get ticket info for each winning ticket
    const ticketIds = sweepstakes.winning_ticket_ids
    const tickets = await pg.manyOrNone<{
      id: string
      user_id: string
    }>(
      `SELECT id, user_id FROM sweepstakes_tickets WHERE id = ANY($1)`,
      [ticketIds]
    )

    // Create a map of ticket_id -> user_id
    const ticketUserMap = new Map(tickets.map((t) => [t.id, t.user_id]))

    // Get all user IDs
    const userIds = [...new Set(tickets.map((t) => t.user_id))]

    // Get user info
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

    // Get existing claims for this sweepstakes
    const existingClaims = await pg.manyOrNone<{
      id: string
      user_id: string
      rank: number
      wallet_address: string
      payment_status: 'awaiting' | 'sent' | 'rejected'
      payment_txn_hash: string | null
      created_time: string
    }>(
      `SELECT id, user_id, rank, wallet_address, payment_status, payment_txn_hash, created_time
       FROM sweepstakes_prize_claims WHERE sweepstakes_num = $1`,
      [sweepstakes.sweepstakes_num]
    )
    const claimMap = new Map(existingClaims.map((c) => [c.user_id, c]))

    // Build claims list in rank order
    for (let i = 0; i < ticketIds.length; i++) {
      const ticketId = ticketIds[i]
      const userId = ticketUserMap.get(ticketId)
      if (!userId) continue

      const user = userMap.get(userId)
      if (!user) continue

      const rank = i + 1
      const prize = getPrizeForRank(sweepstakes.prizes, rank)
      const claim = claimMap.get(userId)

      claims.push({
        id: claim?.id ?? null,
        sweepstakesNum: sweepstakes.sweepstakes_num,
        userId,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatar_url,
        rank,
        prizeAmountUsdc: prize?.amountUsdc ?? 0,
        walletAddress: claim?.wallet_address ?? null,
        paymentStatus: claim?.payment_status ?? null,
        paymentTxnHash: claim?.payment_txn_hash ?? null,
        createdTime: claim?.created_time
          ? new Date(claim.created_time).getTime()
          : null,
      })
    }
  }

  return { claims }
}
