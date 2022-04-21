import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { User } from '../../common/user'
import { Txn, TxnCategory, TxnData } from '../../common/txn'

export const transact = functions.runWith({ minInstances: 1 }).https.onCall(
  async (
    data: {
      amount: number
      toId: string
      category: TxnCategory
      description?: string
      txnData?: TxnData
    },
    context
  ) => {
    const fromId = context?.auth?.uid
    if (!fromId) return { status: 'error', message: 'Not authorized' }

    const { amount, toId, category, description, txnData } = data

    if (amount <= 0 || isNaN(amount) || !isFinite(amount))
      return { status: 'error', message: 'Invalid amount' }

    // run as transaction to prevent race conditions
    return await firestore.runTransaction(async (transaction) => {
      const fromDoc = firestore.doc(`users/${fromId}`)
      const fromSnap = await transaction.get(fromDoc)
      if (!fromSnap.exists) {
        return { status: 'error', message: 'User not found' }
      }
      const fromUser = fromSnap.data() as User

      const toDoc = firestore.doc(`users/${toId}`)
      const toSnap = await transaction.get(toDoc)
      if (!toSnap.exists) {
        return { status: 'error', message: 'User not found' }
      }
      const toUser = toSnap.data() as User

      if (fromUser.balance < amount) {
        return {
          status: 'error',
          message: `Insufficient balance: ${fromUser.username} needed ${amount} but only had ${fromUser.balance} `,
        }
      }

      const newTxnDoc = firestore.collection(`txns/`).doc()

      const txn: Txn = {
        id: newTxnDoc.id,
        createdTime: Date.now(),

        fromId,
        fromName: fromUser.name,
        fromUsername: fromUser.username,
        fromAvatarUrl: fromUser.avatarUrl,

        toId,
        toName: toUser.name,
        toUsername: toUser.username,
        toAvatarUrl: toUser.avatarUrl,

        amount,

        category,
        description,
        data: txnData,
      }

      transaction.create(newTxnDoc, txn)
      transaction.update(fromDoc, { balance: fromUser.balance - amount })
      transaction.update(toDoc, { balance: toUser.balance + amount })

      return { status: 'success', txnId: newTxnDoc.id }
    })
  }
)

const firestore = admin.firestore()
