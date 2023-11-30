import * as admin from 'firebase-admin'
import { User } from 'common/user'
import { FieldValue } from 'firebase-admin/firestore'
import { removeUndefinedProps } from 'common/util/object'
import { ContractResolutionPayoutTxn, Txn } from 'common/txn'
import { isAdminId } from 'common/envs/constants'

export type TxnData = Omit<Txn, 'id' | 'createdTime'>

export async function runTxn(
  fbTransaction: admin.firestore.Transaction,
  data: TxnData & { fromType: 'USER' }
) {
  const firestore = admin.firestore()
  const { amount, fromType, fromId, toId, toType } = data

  if (!isFinite(amount)) {
    return { status: 'error', message: 'Invalid amount' }
  }

  if (!isAdminId(fromId) && amount <= 0) {
    return { status: 'error', message: 'Invalid amount' }
  }

  if (fromType !== 'USER') {
    return {
      status: 'error',
      message: 'This method is only for transfers from users',
    }
  }

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
    fbTransaction.update(toDoc, {
      balance: FieldValue.increment(amount),
      totalDeposits: FieldValue.increment(amount),
    })
  }

  const newTxnDoc = firestore.collection(`txns/`).doc()
  const txn = { id: newTxnDoc.id, createdTime: Date.now(), ...data }
  fbTransaction.create(newTxnDoc, removeUndefinedProps(txn))
  fbTransaction.update(fromDoc, {
    balance: FieldValue.increment(-amount),
    totalDeposits: FieldValue.increment(-amount),
  })

  return { status: 'success', txn }
}
export async function runTxnFromBank(
  fbTransaction: admin.firestore.Transaction,
  data: Omit<TxnData, 'fromId'> & { fromType: 'BANK' }
) {
  const firestore = admin.firestore()
  const { amount, fromType, toId, toType } = data
  if (fromType !== 'BANK')
    return {
      status: 'error',
      message: 'This method is only for transfers from banks',
    }

  if (!isFinite(amount) || amount <= 0) {
    return { status: 'error', message: 'Invalid amount' }
  }

  if (toType === 'USER') {
    const toDoc = firestore.doc(`users/${toId}`)
    fbTransaction.update(toDoc, {
      balance: FieldValue.increment(amount),
      totalDeposits: FieldValue.increment(amount),
    })
  }

  const newTxnDoc = firestore.collection(`txns/`).doc()
  const txn = {
    id: newTxnDoc.id,
    createdTime: Date.now(),
    fromId: 'BANK',
    ...data,
  }
  fbTransaction.create(newTxnDoc, removeUndefinedProps(txn))

  return { status: 'success', txn }
}

export function runContractPayoutTxn(
  fbTransaction: admin.firestore.Transaction,
  txnData: Omit<ContractResolutionPayoutTxn, 'id' | 'createdTime'>
) {
  const firestore = admin.firestore()
  const { amount, toId, data } = txnData
  const { deposit } = data
  const toDoc = firestore.doc(`users/${toId}`)
  fbTransaction.update(toDoc, {
    balance: FieldValue.increment(amount),
    totalDeposits: FieldValue.increment(deposit ?? 0),
  })

  const newTxnDoc = firestore.collection(`txns/`).doc()
  const txn = { id: newTxnDoc.id, createdTime: Date.now(), ...txnData }
  fbTransaction.create(newTxnDoc, removeUndefinedProps(txn))

  return { status: 'success', txn }
}
