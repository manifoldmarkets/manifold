import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { log } from 'shared/utils'

export const adminUpdatePrizePayment: APIHandler<
  'admin-update-prize-payment'
> = async (body, auth) => {
  // Only admins can access this endpoint
  throwErrorIfNotAdmin(auth.uid)

  const { claimId, paymentStatus, paymentTxnHash } = body
  const pg = createSupabaseDirectClient()

  // Update the claim
  const result = await pg.oneOrNone(
    `UPDATE sweepstakes_prize_claims
     SET payment_status = $1,
         payment_txn_hash = COALESCE($2, payment_txn_hash),
         updated_time = now()
     WHERE id = $3
     RETURNING id`,
    [paymentStatus, paymentTxnHash || null, claimId]
  )

  if (!result) {
    throw new APIError(404, 'Prize claim not found')
  }

  log(
    `Admin ${
      auth.uid
    } updated prize claim ${claimId} to status '${paymentStatus}'${
      paymentTxnHash ? ` with txn hash ${paymentTxnHash}` : ''
    }`
  )

  return { success: true }
}
