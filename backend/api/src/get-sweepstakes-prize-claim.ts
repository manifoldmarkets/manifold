import { APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { SweepstakesPrize, getPrizeForRank } from 'common/sweepstakes'

export const getSweepstakesPrizeClaim: APIHandler<
  'get-sweepstakes-prize-claim'
> = async (props, auth) => {
  const { sweepstakesNum } = props
  const pg = createSupabaseDirectClient()

  // Get sweepstakes info
  const sweepstakes = await pg.oneOrNone<{
    sweepstakes_num: number
    winning_ticket_ids: string[] | null
    prizes: SweepstakesPrize[]
  }>(
    `SELECT sweepstakes_num, winning_ticket_ids, prizes 
     FROM sweepstakes 
     WHERE sweepstakes_num = $1`,
    [sweepstakesNum]
  )

  if (!sweepstakes) {
    throw new APIError(404, 'Sweepstakes not found')
  }

  // Check if user is a winner
  let winnerInfo: { rank: number; prizeAmountUsdc: number } | null = null

  if (
    sweepstakes.winning_ticket_ids &&
    sweepstakes.winning_ticket_ids.length > 0
  ) {
    const winningTicket = await pg.oneOrNone<{
      id: string
    }>(
      `SELECT id FROM sweepstakes_tickets 
       WHERE id = ANY($1) AND user_id = $2`,
      [sweepstakes.winning_ticket_ids, auth.uid]
    )

    if (winningTicket) {
      const rank = sweepstakes.winning_ticket_ids.indexOf(winningTicket.id) + 1
      const prize = getPrizeForRank(sweepstakes.prizes, rank)

      winnerInfo = {
        rank,
        prizeAmountUsdc: prize?.amountUsdc ?? 0,
      }
    }
  }

  // Get existing claim for this user (only their own claim)
  // Wrapped in try-catch in case table doesn't exist yet
  let claim: {
    id: string
    rank: number
    prize_amount_usdc: string
    wallet_address: string
    payment_status: 'awaiting' | 'sent' | 'rejected'
    payment_txn_hash: string | null
    created_time: string
  } | null = null

  try {
    claim = await pg.oneOrNone(
      `SELECT id, rank, prize_amount_usdc, wallet_address, payment_status, payment_txn_hash, created_time
       FROM sweepstakes_prize_claims 
       WHERE sweepstakes_num = $1 AND user_id = $2`,
      [sweepstakesNum, auth.uid]
    )
  } catch (e) {
    // Table might not exist yet, that's okay
    console.log('sweepstakes_prize_claims query failed:', e)
  }

  return {
    claim: claim
      ? {
          id: claim.id,
          rank: claim.rank,
          prizeAmountUsdc: parseFloat(claim.prize_amount_usdc),
          walletAddress: claim.wallet_address,
          paymentStatus: claim.payment_status,
          paymentTxnHash: claim.payment_txn_hash,
          createdTime: new Date(claim.created_time).getTime(),
        }
      : null,
    winnerInfo,
  }
}
