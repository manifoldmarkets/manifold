import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { log } from 'shared/utils'
import { getPrizeForRank, SweepstakesPrize } from 'common/sweepstakes'

export const adminUpdatePrizePayment: APIHandler<
  'admin-update-prize-payment'
> = async (body, auth) => {
  throwErrorIfNotAdmin(auth.uid)

  const { claimId, sweepstakesNum, userId, paymentStatus, paymentTxnHash } =
    body
  const pg = createSupabaseDirectClient()

  // Path A — caller knows the claim row id (user submitted a wallet).
  if (claimId) {
    const result = await pg.oneOrNone(
      `UPDATE sweepstakes_prize_claims
         SET payment_status = $1,
             payment_txn_hash = COALESCE($2, payment_txn_hash),
             updated_time = now()
         WHERE id = $3
         RETURNING id`,
      [paymentStatus, paymentTxnHash || null, claimId]
    )
    if (!result) throw new APIError(404, 'Prize claim not found')

    log(
      `Admin ${auth.uid} updated prize claim ${claimId} to '${paymentStatus}'${
        paymentTxnHash ? ` (txn ${paymentTxnHash})` : ''
      }`
    )
    return { success: true }
  }

  // Path B — no claim row yet. Look up the winner's rank/prize from
  // sweepstakes and upsert with NULL wallet_address. Used to record
  // opted_out/rejected for winners who never submitted a wallet.
  if (sweepstakesNum === undefined || !userId) {
    // Schema-level refine should have caught this; defensive.
    throw new APIError(400, 'Missing claim identifier')
  }

  const sweepstakes = await pg.oneOrNone<{
    winning_ticket_ids: string[] | null
    prizes: SweepstakesPrize[]
  }>(
    `SELECT winning_ticket_ids, prizes
       FROM sweepstakes WHERE sweepstakes_num = $1`,
    [sweepstakesNum]
  )
  if (!sweepstakes?.winning_ticket_ids?.length) {
    throw new APIError(400, 'Sweepstakes has no winners')
  }

  // Rank = position of this user's winning ticket in the array (1-indexed).
  const ticket = await pg.oneOrNone<{ id: string }>(
    `SELECT id FROM sweepstakes_tickets
       WHERE id = ANY($1) AND user_id = $2`,
    [sweepstakes.winning_ticket_ids, userId]
  )
  if (!ticket) throw new APIError(400, 'User did not win this sweepstakes')

  const rank = sweepstakes.winning_ticket_ids.indexOf(ticket.id) + 1
  const prize = getPrizeForRank(sweepstakes.prizes, rank)
  const prizeAmount = prize?.amountUsdc ?? 0

  // Upsert: if a row already exists for this user (e.g. they submitted a
  // wallet between the admin loading the page and clicking), just update
  // its status — leave wallet_address untouched.
  await pg.none(
    `INSERT INTO sweepstakes_prize_claims
       (sweepstakes_num, user_id, rank, prize_amount_usdc,
        wallet_address, payment_status, payment_txn_hash)
       VALUES ($1, $2, $3, $4, NULL, $5, $6)
     ON CONFLICT (sweepstakes_num, user_id) DO UPDATE
       SET payment_status = EXCLUDED.payment_status,
           payment_txn_hash = COALESCE(EXCLUDED.payment_txn_hash,
                                       sweepstakes_prize_claims.payment_txn_hash),
           updated_time = now()`,
    [
      sweepstakesNum,
      userId,
      rank,
      prizeAmount,
      paymentStatus,
      paymentTxnHash || null,
    ]
  )

  log(
    `Admin ${auth.uid} upserted prize claim for user ${userId} ` +
      `(sweepstakes #${sweepstakesNum}, rank ${rank}) to '${paymentStatus}'`
  )
  return { success: true }
}
