import * as admin from 'firebase-admin'

import { User } from 'common/user'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { createReferralNotification } from '../create-notification'
import { ReferralTxn } from 'common/txn'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { REFERRAL_AMOUNT } from 'common/economy'

const firestore = admin.firestore()

export async function handleReferral(staleUser: User, eventId: string) {
  // Only create a referral txn if the user has a referredByUserId
  if (!staleUser.referredByUserId || staleUser.lastBetTime) return

  const referredByUserId = staleUser.referredByUserId

  await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${staleUser.id}`)
    const user = (await transaction.get(userDoc)).data() as User

    // Double-check the last bet time in the transaction bc otherwise we'll hand out multiple referral bonuses
    if (user.lastBetTime !== undefined) return

    // get user that referred this user
    const referredByUserDoc = firestore.doc(`users/${referredByUserId}`)
    const referredByUserSnap = await transaction.get(referredByUserDoc)
    if (!referredByUserSnap.exists) {
      console.log(`User ${referredByUserId} not found`)
      return
    }
    const referredByUser = referredByUserSnap.data() as User
    console.log(`referredByUser: ${referredByUserId}`)

    let referredByContract: Contract | undefined = undefined
    if (user.referredByContractId) {
      const referredByContractDoc = firestore.doc(
        `contracts/${user.referredByContractId}`
      )
      referredByContract = await transaction
        .get(referredByContractDoc)
        .then((snap) => snap.data() as Contract)
    }
    console.log(`referredByContract: ${referredByContract?.slug}`)

    let referredByGroup: Group | undefined = undefined
    if (user.referredByGroupId) {
      const referredByGroupDoc = firestore.doc(
        `groups/${user.referredByGroupId}`
      )
      referredByGroup = await transaction
        .get(referredByGroupDoc)
        .then((snap) => snap.data() as Group)
    }
    console.log(`referredByGroup: ${referredByGroup?.slug}`)

    const txns = await transaction.get(
      firestore
        .collection('txns')
        .where('toId', '==', referredByUserId)
        .where('category', '==', 'REFERRAL')
    )
    if (txns.size > 0) {
      // If the referring user already has a referral txn due to referring this user, halt
      if (txns.docs.some((txn) => txn.data()?.description === user.id)) {
        console.log('found referral txn with the same details, aborting')
        return
      }
    }
    console.log('creating referral txns')
    const fromId = HOUSE_LIQUIDITY_PROVIDER_ID

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

    const txnDoc = firestore.collection(`txns/`).doc(txn.id)
    transaction.set(txnDoc, txn)
    console.log('created referral with txn id:', txn.id)
    // We're currently not subtracting Ṁ from the house, not sure if we want to for accounting purposes.
    transaction.update(referredByUserDoc, {
      balance: referredByUser.balance + REFERRAL_AMOUNT,
      totalDeposits: referredByUser.totalDeposits + REFERRAL_AMOUNT,
    })

    // Set lastBetTime to 0 the first time they bet so they still get a streak bonus, but we don't hand out multiple referral txns
    transaction.update(userDoc, {
      lastBetTime: 0,
    })

    await createReferralNotification(
      referredByUser,
      user,
      eventId,
      txn.amount.toString(),
      referredByContract,
      referredByGroup
    )
  })
}
