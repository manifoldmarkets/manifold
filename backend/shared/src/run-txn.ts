import * as admin from 'firebase-admin'
import { User } from 'common/user'
import { FieldValue } from 'firebase-admin/firestore'
import { removeUndefinedProps } from 'common/util/object'
import { ContractResolutionPayoutTxn, Txn } from 'common/txn'

export type TxnData = Omit<Txn, 'id' | 'createdTime'>

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

export function runContractPayoutTxn(
  fbTransaction: admin.firestore.Transaction,
  txnData: Omit<ContractResolutionPayoutTxn, 'id' | 'createdTime'>
) {
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

export function undoContractPayoutTxn(
  fbTransaction: admin.firestore.Transaction,
  txnData: ContractResolutionPayoutTxn
) {
  const { amount, toId, id, data } = txnData
  const { deposit } = data ?? {}
  const toDoc = firestore.doc(`users/${toId}`)
  fbTransaction.update(toDoc, {
    balance: FieldValue.increment(-amount),
    totalDeposits: FieldValue.increment(-(deposit ?? 0)),
  })
  const txnDoc = firestore.doc(`txns/${id}`)

  fbTransaction.update(txnDoc, {
    data: {
      ...(data ?? {}),
      reverted: true,
    },
  })

  return { status: 'success', data: txnData }
}
const firestore = admin.firestore()
