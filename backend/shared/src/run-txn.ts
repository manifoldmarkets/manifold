import * as admin from 'firebase-admin'
import { User } from 'common/user'
import { FieldValue } from 'firebase-admin/firestore'
import { removeUndefinedProps } from 'common/util/object'
import {
  PostAdRedeemTxn,
  ContractResolutionPayoutTxn,
  ContractUndoResolutionPayoutTxn,
  Txn,
} from 'common/txn'

export type TxnData = Omit<Txn, 'id' | 'createdTime'>

export async function runTxn(
  fbTransaction: admin.firestore.Transaction,
  data: TxnData
) {
  const { amount, fromId, fromType, toId, toType, token } = data

  if (!isFinite(amount) || amount <= 0) {
    return { status: 'error', message: 'Invalid amount' }
  }

  if (fromType === 'USER') {
    if (token !== 'M$') {
      return { status: 'error', message: 'only M$ txns supported so far' }
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

    fbTransaction.update(fromDoc, {
      balance: FieldValue.increment(-amount),
      totalDeposits: FieldValue.increment(-amount),
    })
  }

  if (fromType === 'CONTRACT') {
    return { status: 'error', message: 'TODO: txns from contracts' }
  }

  if (fromType === 'AD') {
    return { status: 'error', message: 'TODO: txns from ads' }
  }

  // do nothing if fromType is BANK

  if (toType === 'USER') {
    const toDoc = firestore.doc(`users/${toId}`)
    fbTransaction.update(toDoc, {
      balance: FieldValue.increment(amount),
      totalDeposits: FieldValue.increment(amount),
    })
  }

  if (toType === 'CONTRACT' || toType === 'CHARITY' || toType === 'AD') {
    return { status: 'error', message: 'TODO: recieving txns to ' + toType }
  }

  // do nothing if toType is BANK

  const newTxnDoc = firestore.collection(`txns/`).doc()
  const txn = { id: newTxnDoc.id, createdTime: Date.now(), ...data }
  fbTransaction.create(newTxnDoc, removeUndefinedProps(txn))

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
  const { amount, toId, data, fromId, id } = txnData
  const { deposit } = data ?? {}
  const toDoc = firestore.doc(`users/${toId}`)
  fbTransaction.update(toDoc, {
    balance: FieldValue.increment(-amount),
    totalDeposits: FieldValue.increment(-(deposit ?? 0)),
  })

  const newTxnDoc = firestore.collection(`txns/`).doc()
  const txn = {
    id: newTxnDoc.id,
    createdTime: Date.now(),
    amount: amount,
    toId: fromId,
    fromType: 'USER',
    fromId: toId,
    toType: 'CONTRACT',
    category: 'CONTRACT_UNDO_RESOLUTION_PAYOUT',
    token: 'M$',
    description: `Undo contract resolution payout from contract ${fromId}`,
    data: { revertsTxnId: id },
  } as ContractUndoResolutionPayoutTxn
  fbTransaction.create(newTxnDoc, removeUndefinedProps(txn))

  return { status: 'success', data: txnData }
}
const firestore = admin.firestore()

export function runRedeemAdRewardTxn(
  fbTransaction: admin.firestore.Transaction,
  txnData: Omit<PostAdRedeemTxn, 'id' | 'createdTime'>
) {
  const { amount, toId, fromId } = txnData

  const fromDoc = firestore.doc(`posts/${fromId}`)
  fbTransaction.update(fromDoc, {
    funds: FieldValue.increment(-amount),
  })

  const toDoc = firestore.doc(`users/${toId}`)
  fbTransaction.update(toDoc, {
    balance: FieldValue.increment(amount),
    totalDeposits: FieldValue.increment(amount),
  })

  const newTxnDoc = firestore.collection(`txns/`).doc()
  const txn = { id: newTxnDoc.id, createdTime: Date.now(), ...txnData }
  fbTransaction.create(newTxnDoc, removeUndefinedProps(txn))

  return { status: 'success', txn }
}
