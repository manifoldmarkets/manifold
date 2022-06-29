import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { REFERRAL_AMOUNT, User } from '../../common/user'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from '../../common/antes'
import { getValues, getContract } from './utils'
import { createNotification } from './create-notification'
import { ReferralTxn, Txn } from '../../common/txn'
import { Contract } from '../../common/contract'
const firestore = admin.firestore()

export const onUpdateUser = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const prevUser = change.before.data() as User
    const user = change.after.data() as User
    const { eventId } = context

    // TODO: prevent a user from setting their referral if not the first time
    if (prevUser.referredByUserId !== user.referredByUserId) {
      await handleUserUpdatedReferral(user, eventId)
    }
  })

async function handleUserUpdatedReferral(user: User, eventId: string) {
  // Only create a referral txn if the user has a referredByUserId
  if (!user.referredByUserId) {
    console.log(`Not set: referredByUserId ${user.referredByUserId}`)
    return
  }
  const referredByUserId = user.referredByUserId

  // get user that referred this user
  const referredByUserDoc = firestore.doc(`users/${referredByUserId}`)
  const referredByUserSnap = await referredByUserDoc.get()
  if (!referredByUserSnap.exists) {
    console.log(`User ${referredByUserId} not found`)
    return
  }
  const referredByUser = referredByUserSnap.data() as User

  let referredByContract: Contract | undefined = undefined
  if (user.referredByContractId)
    referredByContract = await getContract(user.referredByContractId)
  console.log(`referredByContract: ${referredByContract}`)

  const txnQuery = firestore
    .collection('txns')
    .where('toId', '==', referredByUserId)
    .where('category', '==', 'REFERRAL')
  const referralTxns = await getValues<Txn>(txnQuery).catch((err) => {
    console.error('error getting txns:', err)
    throw err
  })
  // If the referring user already has a referral txn due to referring this user, halt
  if (referralTxns.map((txn) => txn.description).includes(user.id)) {
    console.log('found referral txn with the same details, aborting')
    return
  }
  console.log('creating referral txns')
  const fromId = HOUSE_LIQUIDITY_PROVIDER_ID

  await firestore.runTransaction(async (transaction) => {
    // if they're updating their referredId, create a txn for both
    const txn: ReferralTxn = {
      id: eventId,
      createdTime: Date.now(),
      fromId,
      fromType: 'BANK',
      toId: referredByUserId,
      toType: 'USER',
      amount: REFERRAL_AMOUNT,
      token: 'M$',
      category: 'REFERRAL',
      description: `Referred new user id: ${user.id} for ${REFERRAL_AMOUNT}`,
    }

    const txnDoc = await firestore.collection(`txns/`).doc(txn.id)
    await transaction.set(txnDoc, txn)
    console.log('created referral with txn id:', txn.id)
    // We're currently not subtracting M$ from the house, not sure if we want to for accounting purposes.
    transaction.update(referredByUserDoc, {
      balance: referredByUser.balance + REFERRAL_AMOUNT,
      totalDeposits: referredByUser.totalDeposits + REFERRAL_AMOUNT,
    })

    await createNotification(
      user.id,
      'user',
      'updated',
      user,
      eventId,
      txn.amount.toString(),
      referredByContract,
      'user',
      referredByUser.id,
      referredByContract?.slug,
      referredByContract?.question
    )
  })
}
