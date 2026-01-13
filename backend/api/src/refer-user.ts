import { APIError, APIHandler } from 'api/helpers/endpoint'
import { MINUTES_ALLOWED_TO_REFER } from 'common/user'
import { Contract } from 'common/contract'
import { createSupabaseDirectClient, SERIAL_MODE } from 'shared/supabase/init'
import { REFERRAL_AMOUNT } from 'common/economy'
import { createReferralNotification } from 'shared/create-notification'
import { convertUser } from 'common/supabase/users'
import { first } from 'lodash'
import { log, getContractSupabase, getUser } from 'shared/utils'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { MINUTE_MS } from 'common/util/time'
import { removeUndefinedProps } from 'common/util/object'
import { trackPublicEvent } from 'shared/analytics'
import { updateUser } from 'shared/supabase/users'
import { getBenefit, SUPPORTER_ENTITLEMENT_IDS } from 'common/supporter-config'
import { convertEntitlement } from 'common/shop/types'

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
  await handleReferral(newUser.id, referredByUser.id, referredByContract)
  await trackPublicEvent(newUser.id, 'Referral', {
    referredByUserId: referredByUser.id,
    referredByContractId: contractId,
  })

  return { success: true }
}

async function handleReferral(
  newUserId: string,
  referredByUserId: string,
  referredByContract?: Contract
) {
  const pg = createSupabaseDirectClient()
  log(`referredByUserId: ${referredByUserId}`)
  const { txn, user } = await pg.tx({ mode: SERIAL_MODE }, async (tx) => {
    const newUser = await getUser(newUserId, tx)
    if (!newUser) throw new APIError(500, `User ${newUserId} not found`)

    if (newUser.referredByUserId || newUser.referredByContractId) {
      throw new APIError(400, `User ${newUser.id} already has referral details`)
    }
    if (
      newUser.createdTime <
      Date.now() - MINUTES_ALLOWED_TO_REFER * MINUTE_MS
    ) {
      throw new APIError(400, `User ${newUser.id} is too old to be referred`)
    }

    const txns = await tx.one(
      `select count(*) from txns where to_id = $1
       and category = 'REFERRAL'
       and data->>'referredUserId' = $2`,
      [referredByUserId, newUser.id],
      (row) => row.count
    )

    // If the referring user already has a referral txn due to referring this user, halt
    // TODO: store in data instead
    if (txns > 0) {
      throw new APIError(
        404,
        'Existing referral bonus found with matching details'
      )
    }
    log('creating referral txns')

    // Fetch referrer's supporter entitlements for bonus multiplier
    const supporterEntitlementRows = await tx.manyOrNone(
      `SELECT user_id, entitlement_id, granted_time, expires_time, enabled FROM user_entitlements
       WHERE user_id = $1
       AND entitlement_id = ANY($2)
       AND enabled = true
       AND (expires_time IS NULL OR expires_time > NOW())`,
      [referredByUserId, SUPPORTER_ENTITLEMENT_IDS]
    )

    // Convert to UserEntitlement format for getBenefit
    const entitlements = supporterEntitlementRows.map(convertEntitlement)

    // Get tier-specific referral multiplier (1x for non-supporters)
    const referralMultiplier = getBenefit(entitlements, 'referralMultiplier')
    const referralAmount = Math.floor(REFERRAL_AMOUNT * referralMultiplier)

    // if they're updating their referredId, create a txn for both
    const txnData = {
      fromType: 'BANK',
      toId: referredByUserId,
      toType: 'USER',
      amount: referralAmount,
      token: 'M$',
      category: 'REFERRAL',
      description: `Referred new user id: ${newUser.id} for ${referralAmount}`,
      data: removeUndefinedProps({
        referredUserId: newUser.id,
        referredContractId: referredByContract?.id,
        supporterBonus: referralMultiplier > 1,
        referralMultiplier,
      }),
    } as const

    const txn = await runTxnFromBank(tx, txnData)

    await updateUser(
      tx,
      newUserId,
      removeUndefinedProps({
        referredByUserId,
        referredByContractId: referredByContract?.id,
      })
    )

    return { txn, user: newUser }
  })

  await createReferralNotification(
    referredByUserId,
    user,
    txn.amount.toString(),
    referredByContract
  )
}
