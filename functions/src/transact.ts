import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { User } from 'common/user'
import { Txn } from 'common/txn'
import { removeUndefinedProps } from 'common/util/object'

export type TxnData = Omit<Txn, 'id' | 'createdTime'>

export const transact = functions
  .runWith({ minInstances: 1 })
  .https.onCall(async (data: TxnData, context) => {
    const userId = context?.auth?.uid
    if (!userId) return { status: 'error', message: 'Not authorized' }

    if (userId !== data.fromId) {
      return {
        status: 'error',
        message: 'Must be authenticated with userId equal to specified fromId.',
      }
    }

    // Run as transaction to prevent race conditions.
    return await firestore.runTransaction(async (transaction) => {
      await runTxn(transaction, data)
    })
  })

export async function runTxn(
  fbTransaction: admin.firestore.Transaction,
  data: TxnData
) {
  const { amount, fromType, fromId, toId, toType, description } = data

  if (fromType !== 'USER')
    return {
      status: 'error',
      message: "From type is only implemented for type 'user'.",
    }

  if (amount <= 0 || isNaN(amount) || !isFinite(amount))
    return { status: 'error', message: 'Invalid amount' }

  const fromDoc = firestore.doc(`users/${fromId}`)
  const fromSnap = await fbTransaction.get(fromDoc)
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

  // TODO: Track payments received by charities, bank, contracts too.
  if (toType === 'USER') {
    const toDoc = firestore.doc(`users/${toId}`)
    const toSnap = await fbTransaction.get(toDoc)
    if (!toSnap.exists) {
      return { status: 'error', message: 'User not found' }
    }
    const toUser = toSnap.data() as User
    fbTransaction.update(toDoc, {
      balance: toUser.balance + amount,
      totalDeposits: toUser.totalDeposits + amount,
    })
  }

  const newTxnDoc = firestore.collection(`txns/`).doc()
  const txn: Txn = { id: newTxnDoc.id, createdTime: Date.now(), ...data }
  fbTransaction.create(newTxnDoc, removeUndefinedProps(txn))
  fbTransaction.update(fromDoc, {
    balance: fromUser.balance - amount,
    totalDeposits: fromUser.totalDeposits - amount,
  })

  return { status: 'success', txn }
}

const firestore = admin.firestore()
