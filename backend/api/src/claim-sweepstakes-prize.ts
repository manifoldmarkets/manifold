import { APIHandler, APIError } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { SweepstakesPrize, getPrizeForRank } from 'common/sweepstakes'

export const claimSweepstakesPrize: APIHandler<
  'claim-sweepstakes-prize'
> = async (props, auth) => {
  const { sweepstakesNum, walletAddress } = props
  const pg = createSupabaseDirectClient()

  return await pg.tx(async (tx) => {
    // Get sweepstakes and verify it's closed and has winners
    const sweepstakes = await tx.oneOrNone<{
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

    if (
      !sweepstakes.winning_ticket_ids ||
      sweepstakes.winning_ticket_ids.length === 0
    ) {
      throw new APIError(400, 'Winners have not been selected yet')
    }

    // Check if user is a winner and get their rank
    const winningTicket = await tx.oneOrNone<{
      id: string
      user_id: string
    }>(
      `SELECT id, user_id FROM sweepstakes_tickets 
         WHERE id = ANY($1) AND user_id = $2`,
      [sweepstakes.winning_ticket_ids, auth.uid]
    )

    if (!winningTicket) {
      throw new APIError(403, 'You are not a winner of this sweepstakes')
    }

    // Determine the user's rank based on position in winning_ticket_ids array
    const rank = sweepstakes.winning_ticket_ids.indexOf(winningTicket.id) + 1

    if (rank === 0) {
      throw new APIError(500, 'Could not determine winner rank')
    }

    // Get the prize amount for this rank
    const prize = getPrizeForRank(sweepstakes.prizes, rank)
    const prizeAmount = prize?.amountUsdc ?? 0

    // Check if claim already exists
    const existingClaim = await tx.oneOrNone(
      `SELECT id FROM sweepstakes_prize_claims 
         WHERE sweepstakes_num = $1 AND user_id = $2`,
      [sweepstakesNum, auth.uid]
    )

    if (existingClaim) {
      throw new APIError(400, 'You have already submitted a claim')
    }

    // Insert the claim
    const claim = await tx.one<{ id: string }>(
      `INSERT INTO sweepstakes_prize_claims 
         (sweepstakes_num, user_id, rank, prize_amount_usdc, wallet_address, payment_status)
         VALUES ($1, $2, $3, $4, $5, 'awaiting')
         RETURNING id`,
      [sweepstakesNum, auth.uid, rank, prizeAmount, walletAddress]
    )

    return {
      success: true,
      claimId: claim.id,
    }
  })
}
