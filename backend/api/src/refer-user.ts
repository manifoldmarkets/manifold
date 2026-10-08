import { APIError, APIHandler } from 'api/helpers/endpoint'
import { MINUTES_ALLOWED_TO_REFER } from 'common/user'
import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { convertUser } from 'common/supabase/users'
import { first } from 'lodash'
import { log, getContractSupabase, getUser } from 'shared/utils'
import { MINUTE_MS } from 'common/util/time'
import { removeUndefinedProps } from 'common/util/object'
import { trackPublicEvent } from 'shared/analytics'
import { REFERRAL_AMOUNT } from 'common/economy'
import { createReferralNotification } from 'shared/create-notification'
import { payReferralBonus } from 'shared/referral-bonus'
import { broadcastUpdatedUser } from 'shared/websockets/helpers'

export const referUser: APIHandler<'refer-user'> = async (props, auth) => {
  const { referredByUsername, contractId } = props

  const pg = createSupabaseDirectClient()
  const referredByUser = first(
    await pg.map(
      `select * from users where username = $1`,
      [referredByUsername],
      (row) => convertUser(row)
    )
  )
  if (!referredByUser) {
    throw new APIError(404, `User ${referredByUsername} not found`)
  }
  if (referredByUser.id === auth.uid) {
    throw new APIError(400, `Cannot refer yourself`)
  }
  if (referredByUser.isBannedFromPosting) {
    throw new APIError(
      404,
      `User ${referredByUsername} is banned from posting, not eligible for referral bonus`
    )
  }
  const newUser = await getUser(auth.uid)
  if (!newUser) {
    throw new APIError(401, `User ${auth.uid} not found`)
  }
  let referredByContract: Contract | undefined
  if (contractId) {
    referredByContract = await getContractSupabase(contractId)
    if (!referredByContract) {
      throw new APIError(404, `Contract ${contractId} not found`)
    }
    log(`referredByContract: ${referredByContract.slug}`)
  }
  const bonusAmount = await handleReferral(
    newUser.id,
    referredByUser.id,
    referredByContract
  )
  if (bonusAmount) {
    await createReferralNotification(
      referredByUser.id,
      newUser,
      bonusAmount.toString(),
      referredByContract,
      'signup'
    )
  }
  await trackPublicEvent(newUser.id, 'Referral', {
    referredByUserId: referredByUser.id,
    referredByContractId: contractId,
  })

  return { success: true }
}

// Records the referral relationship and pays the referrer the full referral
// bonus right away — the referred user doesn't need to bet or verify. Returns
// the amount paid (null when the referrer's tier earns nothing).
async function handleReferral(
  newUserId: string,
  referredByUserId: string,
  referredByContract?: Contract
) {
  log(`referredByUserId: ${referredByUserId}`)

  const referralFields = removeUndefinedProps({
    referredByUserId,
    referredByContractId: referredByContract?.id,
    // Marks this referral as settled here, even when the payout below rounds
    // to zero, so the legacy halves can never pay it later.
    referralPayoutAtSignup: true,
  })

  // READ COMMITTED, not SERIALIZABLE: the payout waits on the referrer's bet
  // queue and then credits their balance, so under SERIALIZABLE any bet the
  // referrer committed meanwhile would abort it. The conditional update below
  // is the dedupe instead — a concurrent call blocks on the row lock, re-checks
  // the WHERE, and claims nothing. Routine 400s (already referred, too old)
  // are expected, not errors.
  const amount = await runTransactionWithRetries(
    async (tx) => {
      const newUser = await getUser(newUserId, tx)
      if (!newUser) throw new APIError(500, `User ${newUserId} not found`)

      const referrer = await getUser(referredByUserId, tx)
      if (!referrer)
        throw new APIError(500, `Referrer ${referredByUserId} not found`)

      if (
        newUser.createdTime <
        Date.now() - MINUTES_ALLOWED_TO_REFER * MINUTE_MS
      ) {
        throw new APIError(400, `User ${newUser.id} is too old to be referred`)
      }

      const claimed = await tx.oneOrNone(
        `update users set data = data || $2::jsonb
         where id = $1
           and data->>'referredByUserId' is null
           and data->>'referredByContractId' is null
         returning id`,
        [newUserId, JSON.stringify(referralFields)]
      )
      if (!claimed) {
        throw new APIError(
          400,
          `User ${newUserId} already has referral details`
        )
      }
      log(
        `Recorded referral relationship: ${newUserId} referred by ${referredByUserId}`
      )

      return await payReferralBonus(tx, {
        referrer,
        referredUserId: newUserId,
        referredContractId: referredByContract?.id,
        bonusType: 'signup',
        baseAmount: REFERRAL_AMOUNT,
      })
    },
    3,
    { mode: 'default', isExpectedError: (e) => e instanceof APIError }
  )
  broadcastUpdatedUser({ id: newUserId, ...referralFields })
  return amount
}
