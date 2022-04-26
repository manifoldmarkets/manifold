import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { User } from '../../common/user'
import { Txn } from '../../common/txn'
import { removeUndefinedProps } from '../../common/util/object'

export const transact = functions
  .runWith({ minInstances: 1 })
  .https.onCall(async (data: Exclude<Txn, 'id' | 'createdTime'>, context) => {
    const userId = context?.auth?.uid
    if (!userId) return { status: 'error', message: 'Not authorized' }

    const {
      amount,
      fromType,
      fromId,
      toId,
      toType,
      category,
      description,
      data: txnData,
    } = data

    if (fromType !== 'user')
      return {
        status: 'error',
        message: "From type is only implemented for type 'user'.",
      }

    if (fromId !== userId)
      return {
        status: 'error',
        message: 'Must be authenticated with userId equal to specified fromId.',
      }

    if (amount <= 0 || isNaN(amount) || !isFinite(amount))
      return { status: 'error', message: 'Invalid amount' }

    // Run as transaction to prevent race conditions.
    return await firestore.runTransaction(async (transaction) => {
      const fromDoc = firestore.doc(`users/${userId}`)
      const fromSnap = await transaction.get(fromDoc)
      if (!fromSnap.exists) {
        return { status: 'error', message: 'User not found' }
      }
      const fromUser = fromSnap.data() as User

      if (fromUser.balance < amount) {
        return {
          status: 'error',
          message: `Insufficient balance: ${fromUser.username} needed ${amount} but only had ${fromUser.balance} `,
        }
      }

      if (toType === 'user') {
        const toDoc = firestore.doc(`users/${toId}`)
        const toSnap = await transaction.get(toDoc)
        if (!toSnap.exists) {
          return { status: 'error', message: 'User not found' }
        }
        const toUser = toSnap.data() as User
        transaction.update(toDoc, { balance: toUser.balance + amount })
      }

      const newTxnDoc = firestore.collection(`txns/`).doc()

      const txn: Txn = removeUndefinedProps({
        id: newTxnDoc.id,
        createdTime: Date.now(),
        fromId,
        fromType,
        toId,
        toType,

        amount,

        category,
        description,
        data: txnData,
      })

      transaction.create(newTxnDoc, txn)
      transaction.update(fromDoc, { balance: fromUser.balance - amount })

      return { status: 'success', txnId: newTxnDoc.id }
    })
  })

const firestore = admin.firestore()
