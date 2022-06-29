import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { User } from '../../common/user'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from '../../common/antes'
import { getValues, getContract } from './utils'
import { createNotification } from './create-notification'
import { ReferralTxn, Txn } from '../../common/txn'
import { Contract } from '../../common/contract'
const firestore = admin.firestore()

export const ReferredUserDescriptionPrefix = 'Referred user id'

export const onUpdateUser = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const prevUser = change.before.data() as User
    const user = change.after.data() as User
    const { eventId } = context

    if (prevUser.referredByUserId === user.referredByUserId) {
      console.log("referredByUserId hasn't changed")
      return // We only handle referrals right now.
    }

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
    // find txns to this user, find if they have a txn that contains a BANK category txn that contains 'referred by' the current username in the description
    const referralTxns = await getValues<Txn>(txnQuery).catch((err) => {
      console.error('error getting txns:', err)
      return []
    })
    if (referralTxns.map((txn) => txn.description).includes(referredByUserId)) {
      console.log('found referral txn with the same details, aborting')
      return
    }
    console.log('creating referral txns')
    // TODO: change this to prod id
    const fromId = HOUSE_LIQUIDITY_PROVIDER_ID
    const referralAmount = 500

    await firestore.runTransaction(async (transaction) => {
      // if they're updating their referredId, create a txn for both
      const txn: ReferralTxn = {
        id: eventId,
        createdTime: Date.now(),
        fromId,
        fromType: 'BANK',
        toId: referredByUserId,
        toType: 'USER',
        amount: referralAmount,
        token: 'M$',
        category: 'REFERRAL',
        description: `${ReferredUserDescriptionPrefix}: ${user.id} for ${referralAmount}`,
      }

      const txnDoc = await firestore.collection(`txns/`).doc(txn.id)
      await transaction.set(txnDoc, txn)
      console.log('created referral with txn id:', txn.id)
      transaction.update(referredByUserDoc, {
        balance: referredByUser.balance + referralAmount,
        totalDeposits: referredByUser.totalDeposits + referralAmount,
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
  })
