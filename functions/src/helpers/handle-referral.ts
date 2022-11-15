import * as admin from 'firebase-admin'

import { User } from '../../../common/user'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from '../../../common/antes'
import { createReferralNotification } from '../create-notification'
import { ReferralTxn } from '../../../common/txn'
import { Contract } from '../../../common/contract'
import { Group } from '../../../common/group'
import { REFERRAL_AMOUNT } from '../../../common/economy'

const firestore = admin.firestore()

export async function handleReferral(user: User, eventId: string) {
  // Only create a referral txn if the user has a referredByUserId
  if (!user.referredByUserId) {
    console.log(`Not set: referredByUserId ${user.referredByUserId}`)
    return
  }
  const referredByUserId = user.referredByUserId

  await firestore.runTransaction(async (transaction) => {
    // get user that referred this user
    const referredByUserDoc = firestore.doc(`users/${referredByUserId}`)
    const referredByUserSnap = await transaction.get(referredByUserDoc)
    if (!referredByUserSnap.exists) {
      console.log(`User ${referredByUserId} not found`)
      return
    }
    const referredByUser = referredByUserSnap.data() as User

    let referredByContract: Contract | undefined = undefined
    if (user.referredByContractId) {
      const referredByContractDoc = firestore.doc(
        `contracts/${user.referredByContractId}`
      )
      referredByContract = await transaction
        .get(referredByContractDoc)
        .then((snap) => snap.data() as Contract)
    }
    console.log(`referredByContract: ${referredByContract}`)

    let referredByGroup: Group | undefined = undefined
    if (user.referredByGroupId) {
      const referredByGroupDoc = firestore.doc(
        `groups/${user.referredByGroupId}`
      )
      referredByGroup = await transaction
        .get(referredByGroupDoc)
        .then((snap) => snap.data() as Group)
    }
    console.log(`referredByGroup: ${referredByGroup}`)

    const txns = await transaction.get(
      firestore
        .collection('txns')
        .where('toId', '==', referredByUserId)
        .where('category', '==', 'REFERRAL')
    )
    if (txns.size > 0) {
      // If the referring user already has a referral txn due to referring this user, halt
      if (txns.docs.map((txn) => txn.data()?.description).includes(user.id)) {
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
    // We're currently not subtracting M$ from the house, not sure if we want to for accounting purposes.
    transaction.update(referredByUserDoc, {
      balance: referredByUser.balance + REFERRAL_AMOUNT,
      totalDeposits: referredByUser.totalDeposits + REFERRAL_AMOUNT,
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
