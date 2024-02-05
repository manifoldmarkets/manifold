import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { MINUTES_ALLOWED_TO_REFER, User } from 'common/user'
import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { ReferralTxn } from 'common/txn'
import { REFERRAL_AMOUNT } from 'common/economy'
import { createReferralNotification } from 'shared/create-notification'
import { completeReferralsQuest } from 'shared/complete-quest-internal'
import { convertUser } from 'common/supabase/users'
import { first } from 'lodash'
import * as admin from 'firebase-admin'
import { GCPLog, getContractSupabase, getUserFirebase } from 'shared/utils'
import * as crypto from 'crypto'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { MINUTE_MS } from 'common/util/time'
import { removeUndefinedProps } from 'common/util/object'
import { trackPublicEvent } from 'shared/analytics'

const bodySchema = z
  .object({
    referredByUsername: z.string(),
    contractId: z.string().optional(),
  })
  .strict()

export const referuser = authEndpoint(async (req, auth, log) => {
  const { referredByUsername, contractId } = validate(bodySchema, req.body)

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
  const newUser = await getUserFirebase(auth.uid)
  if (!newUser) {
    throw new APIError(403, `User ${auth.uid} not found`)
  }
  let referredByContract: Contract | undefined
  if (contractId) {
    referredByContract = await getContractSupabase(contractId)
    if (!referredByContract) {
      throw new APIError(404, `Contract ${contractId} not found`)
    }
    log(`referredByContract: ${referredByContract.slug}`)
  }
  await handleReferral(newUser.id, referredByUser.id, log, referredByContract)
  await trackPublicEvent(newUser.id, 'Referral', {
    referredByUserId: referredByUser.id,
    referredByContractId: contractId,
  })

  return { status: 'ok' }
})

async function handleReferral(
  newUserId: string,
  referredByUserId: string,
  log: GCPLog,
  referredByContract?: Contract
) {
  const firestore = admin.firestore()

  const userDoc = firestore.doc(`users/${newUserId}`)
  const userSnap = await userDoc.get()
  if (!userSnap.exists) {
    throw new APIError(404, `User ${newUserId} not found`)
  }
  const user = userSnap.data() as User
  if (user.referredByUserId || user.referredByContractId) {
    throw new APIError(400, `User ${user.id} already has referral details`)
  }
  if (user.createdTime < Date.now() - MINUTES_ALLOWED_TO_REFER * MINUTE_MS) {
    throw new APIError(400, `User ${user.id} is too old to be referred`)
  }

  const pg = createSupabaseDirectClient()

  log(`referredByUserId: ${referredByUserId}`)
  const res = await pg.tx(async (tx) => {
    const txns = await tx.manyOrNone(
      `select * from txns where data->>'toId' = $1 and data->>'category' = 'REFERRAL' limit 1`,
      [referredByUserId]
    )

    // If the referring user already has a referral txn due to referring this user, halt
    // TODO: store in data instead
    if (txns.some((txn) => txn.data()?.description.includes(user.id))) {
      throw new APIError(
        404,
        'Existing referral bonus found with matching details'
      )
    }
    log('creating referral txns')

    // if they're updating their referredId, create a txn for both
    const txnData: Omit<ReferralTxn, 'fromId'> = {
      id: crypto.randomUUID(),
      createdTime: Date.now(),
      fromType: 'BANK',
      toId: referredByUserId,
      toType: 'USER',
      amount: REFERRAL_AMOUNT,
      token: 'M$',
      category: 'REFERRAL',
      description: `Referred new user id: ${user.id} for ${REFERRAL_AMOUNT}`,
    }
    const txn = await runTxnFromBank(tx, txnData)

    userDoc.update(
      removeUndefinedProps({
        referredByUserId,
        referredByContractId: referredByContract?.id,
      })
    )

    return { user, txn }
  })
  if (!res || !res.txn) return

  await createReferralNotification(
    referredByUserId,
    user,
    res.txn.amount.toString(),
    referredByContract
  )
  await completeReferralsQuest(referredByUserId)
}
