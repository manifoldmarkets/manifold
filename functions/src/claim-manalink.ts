import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { User } from 'common/user'
import { Manalink } from 'common/manalink'
import { runTxn, TxnData } from './transact'

export const claimManalink = functions
  .runWith({ minInstances: 1 })
  .https.onCall(async (slug: string, context) => {
    const userId = context?.auth?.uid
    if (!userId) return { status: 'error', message: 'Not authorized' }

    // Run as transaction to prevent race conditions.
    return await firestore.runTransaction(async (transaction) => {
      // Look up the manalink
      const manalinkDoc = firestore.doc(`manalinks/${slug}`)
      const manalinkSnap = await transaction.get(manalinkDoc)
      if (!manalinkSnap.exists) {
        return { status: 'error', message: 'Manalink not found' }
      }
      const manalink = manalinkSnap.data() as Manalink

      const { amount, fromId, claimedUserIds } = manalink

      if (amount <= 0 || isNaN(amount) || !isFinite(amount))
        return { status: 'error', message: 'Invalid amount' }

      const fromDoc = firestore.doc(`users/${fromId}`)
      const fromSnap = await transaction.get(fromDoc)
      if (!fromSnap.exists) {
        return { status: 'error', message: `User ${fromId} not found` }
      }
      const fromUser = fromSnap.data() as User

      // Only permit one redemption per user per link
      if (claimedUserIds.includes(userId)) {
        return {
          status: 'error',
          message: `${fromUser.name} already redeemed manalink ${slug}`,
        }
      }

      // Disallow expired or maxed out links
      if (manalink.expiresTime != null && manalink.expiresTime < Date.now()) {
        return {
          status: 'error',
          message: `Manalink ${slug} expired on ${new Date(
            manalink.expiresTime
          ).toLocaleString()}`,
        }
      }
      if (
        manalink.maxUses != null &&
        manalink.maxUses <= manalink.claims.length
      ) {
        return {
          status: 'error',
          message: `Manalink ${slug} has reached its max uses of ${manalink.maxUses}`,
        }
      }

      if (fromUser.balance < amount) {
        return {
          status: 'error',
          message: `Insufficient balance: ${fromUser.name} needed ${amount} for this manalink but only had ${fromUser.balance} `,
        }
      }

      // Actually execute the txn
      const data: TxnData = {
        fromId,
        fromType: 'USER',
        toId: userId,
        toType: 'USER',
        amount,
        token: 'M$',
        category: 'MANALINK',
        description: `Manalink ${slug} claimed: ${amount} from ${fromUser.username} to ${userId}`,
      }
      const result = await runTxn(transaction, data)
      const txnId = result.txn?.id
      if (!txnId) {
        return { status: 'error', message: result.message }
      }

      // Update the manalink object with this info
      const claim = {
        toId: userId,
        txnId,
        claimedTime: Date.now(),
      }
      transaction.update(manalinkDoc, {
        claimedUserIds: [...claimedUserIds, userId],
        claims: [...manalink.claims, claim],
      })

      return { status: 'success', message: 'Manalink claimed' }
    })
  })

const firestore = admin.firestore()
