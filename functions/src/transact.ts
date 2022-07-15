import * as admin from 'firebase-admin'

import { User } from '../../common/user'
import { Txn } from '../../common/txn'
import { removeUndefinedProps } from '../../common/util/object'
import { APIError, newEndpoint } from './api'

export type TxnData = Omit<Txn, 'id' | 'createdTime'>

// TODO: We totally fail to validate most of the input to this function,
// so anyone can spam our database with malformed transactions.

export const transact = newEndpoint({}, async (req, auth) => {
  const data = req.body
  const { amount, fromType, fromId } = data

  if (fromType !== 'USER')
    throw new APIError(400, "From type is only implemented for type 'user'.")

  if (fromId !== auth.uid)
    throw new APIError(
      403,
      'Must be authenticated with userId equal to specified fromId.'
    )

  if (isNaN(amount) || !isFinite(amount))
    throw new APIError(400, 'Invalid amount')

  // Run as transaction to prevent race conditions.
  return await firestore.runTransaction(async (transaction) => {
    const result = await runTxn(transaction, data)
    if (result.status == 'error') {
      throw new APIError(500, result.message ?? 'An unknown error occurred.')
    }
    return result
  })
})

export async function runTxn(
  fbTransaction: admin.firestore.Transaction,
  data: TxnData
) {
  const { amount, fromId, toId, toType } = data

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
  const txn = { id: newTxnDoc.id, createdTime: Date.now(), ...data }
  fbTransaction.create(newTxnDoc, removeUndefinedProps(txn))
  fbTransaction.update(fromDoc, {
    balance: fromUser.balance - amount,
    totalDeposits: fromUser.totalDeposits - amount,
  })

  return { status: 'success', txn }
}

const firestore = admin.firestore()
