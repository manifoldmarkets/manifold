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
import { updateUser } from 'shared/supabase/users'
import { REFERRAL_AMOUNT } from 'common/economy'
import { ReferralTxn } from 'common/txn'
import {
  getEffectiveBonusMultiplier,
  resolveEffectiveTier,
  roundTierBonus,
} from 'common/supporter-config'
import { getActiveSupporterEntitlements } from 'shared/supabase/entitlements'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { createReferralNotification } from 'shared/create-notification'

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

  // SERIALIZABLE: the referredByUserId check below is the dedupe for the
  // payout, so concurrent refer-user calls must not both pass it. Retried,
  // because crediting the referrer means two signups referred by the same
  // user at once can conflict, and a lost attempt would drop the referral.
  return await runTransactionWithRetries(async (tx) => {
    const newUser = await getUser(newUserId, tx)
    if (!newUser) throw new APIError(500, `User ${newUserId} not found`)

    const referrer = await getUser(referredByUserId, tx)
    if (!referrer) throw new APIError(500, `Referrer ${referredByUserId} not found`)

    if (newUser.referredByUserId || newUser.referredByContractId) {
      throw new APIError(400, `User ${newUser.id} already has referral details`)
    }
    if (
      newUser.createdTime <
      Date.now() - MINUTES_ALLOWED_TO_REFER * MINUTE_MS
    ) {
      throw new APIError(400, `User ${newUser.id} is too old to be referred`)
    }

    await updateUser(
      tx,
      newUserId,
      removeUndefinedProps({
        referredByUserId,
        referredByContractId: referredByContract?.id,
        // Marks this referral as settled here, even when the amount below
        // rounds to zero, so the legacy halves can never pay it later.
        referralPayoutAtSignup: true,
      })
    )
    log(
      `Recorded referral relationship: ${newUserId} referred by ${referredByUserId}`
    )

    // Scaled by the referrer's effective tier: flagged referrers get nothing,
    // bonus-blocked ones a reduced 0.2x, free 1x, subscribers higher.
    const entitlements = await getActiveSupporterEntitlements(tx, referrer.id)
    const referrerTier = resolveEffectiveTier({
      entitlements,
      bonusEligibility: referrer.bonusEligibility,
    })
    const referralMultiplier = getEffectiveBonusMultiplier(
      referrerTier,
      'referral'
    )
    const amount = roundTierBonus(REFERRAL_AMOUNT * referralMultiplier)
    if (amount <= 0) {
      log(
        `Skipped referral bonus for referrer ${referrer.id} - effective tier ${referrerTier} (multiplier ${referralMultiplier})`
      )
      return null
    }

    const bonusTxn: Omit<ReferralTxn, 'id' | 'createdTime' | 'fromId'> = {
      fromType: 'BANK',
      toId: referrer.id,
      toType: 'USER',
      amount,
      token: 'M$',
      category: 'REFERRAL',
      description: `Referral bonus for new user ${newUserId}: ${amount}`,
      data: removeUndefinedProps({
        referredUserId: newUserId,
        referredContractId: referredByContract?.id,
        bonusType: 'signup',
        effectiveTier: referrerTier,
        referralMultiplier,
        supporterBonus: referralMultiplier > 1,
      }),
    }
    await runTxnFromBank(tx, bonusTxn)
    log(`Paid referral bonus of ${amount} to ${referrer.id} for ${newUserId}`)
    return amount
  })
}
