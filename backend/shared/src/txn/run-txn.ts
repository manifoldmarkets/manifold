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
import { createSupabaseDirectClient } from '../supabase/init'
import { isProd } from 'shared/utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'

export type TxnData = Omit<Txn, 'id' | 'createdTime'>

export async function runTxn(
  fbTransaction: admin.firestore.Transaction,
  data: TxnData
) {
  const { amount, fromId, toId, toType } = data

  if (!isFinite(amount) || amount <= 0) {
    return { status: 'error', message: 'Invalid amount' }
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
  data: TxnData
) {
  const { amount, fromType, toId, toType } = data
  if (fromType !== 'BANK')
    return {
      status: 'error',
      message: 'This method is only for fromType = BANK',
    }

  data.fromId = isProd()
    ? HOUSE_LIQUIDITY_PROVIDER_ID
    : DEV_HOUSE_LIQUIDITY_PROVIDER_ID

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

  // TODO: lock
  const db = createSupabaseDirectClient()
  db.none('update posts set funds = funds - $1 where id = $2', [amount, fromId])

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
