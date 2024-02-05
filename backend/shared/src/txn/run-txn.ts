import * as admin from 'firebase-admin'
import { User } from 'common/user'
import { FieldValue } from 'firebase-admin/firestore'
import { Txn } from 'common/txn'
import { isAdminId } from 'common/envs/constants'
import { bulkInsert } from 'shared/supabase/utils'
import { APIError } from 'common/api/utils'
import { SupabaseDirectClient, SupabaseTransaction } from 'shared/supabase/init'

export type TxnData = Omit<Txn, 'id' | 'createdTime'>

/** This creates an firestore transaction within. DO NOT run within another firestore transaction! */
export async function runTxn(
  pgTransaction: SupabaseTransaction,
  data: TxnData & { fromType: 'USER' }
) {
  const { amount, fromType, fromId, toId, toType } = data

  if (!isFinite(amount)) {
    throw new APIError(400, 'Invalid amount')
  }

  if (!isAdminId(fromId) && amount <= 0) {
    throw new APIError(400, "Amount can't be negative")
  }

  if (fromType !== 'USER') {
    throw new APIError(400, 'This method is only for transfers from users')
  }

  const firestore = admin.firestore()

  return await firestore.runTransaction(async (fbTransaction) => {
    const fromDoc = firestore.doc(`users/${fromId}`)
    const fromSnap = await fbTransaction.get(fromDoc)
    if (!fromSnap.exists) {
      throw new APIError(404, 'User not found')
    }
    const fromUser = fromSnap.data() as User

    if (fromUser.balance < amount) {
      throw new APIError(
        403,
        `Insufficient balance: ${fromUser.username} needed ${amount} but only had ${fromUser.balance}`
      )
    }

    const res = await insertTxns(pgTransaction, data)

    // TODO: Track payments received by charities, bank, contracts too.
    if (toType === 'USER') {
      const toDoc = firestore.doc(`users/${toId}`)
      fbTransaction.update(toDoc, {
        balance: FieldValue.increment(amount),
        totalDeposits: FieldValue.increment(amount),
      })
    }

    fbTransaction.update(fromDoc, {
      balance: FieldValue.increment(-amount),
      totalDeposits: FieldValue.increment(-amount),
    })

    return res[0]
  })
}

export async function runTxnFromBank(
  pgTransaction: SupabaseTransaction,
  data: Omit<TxnData, 'fromId'> & { fromType: 'BANK' },
  affectsProfit = false
) {
  const firestore = admin.firestore()
  const { amount, fromType, toId, toType } = data
  if (fromType !== 'BANK') {
    throw new APIError(400, 'This method is only for transfers from banks')
  }

  if (!isFinite(amount) || amount <= 0) {
    throw new APIError(400, 'Invalid amount')
  }

  const res = await insertTxns(pgTransaction, { fromId: 'BANK', ...data })

  if (toType === 'USER') {
    const toDoc = firestore.doc(`users/${toId}`)
    toDoc.update({
      balance: FieldValue.increment(amount),
      ...(affectsProfit ? {} : { totalDeposits: FieldValue.increment(amount) }),
    })
  }

  return res[0]
}

export async function insertTxns(
  pgTransaction: SupabaseDirectClient,
  ...txns: TxnData[]
) {
  const now = Date.now()
  const fullTxns = txns.map((txn) => ({
    id: crypto.randomUUID(),
    createdTime: now,
    ...txn,
  }))

  await bulkInsert(
    pgTransaction,
    'txns',
    fullTxns.map((txn) => ({ id: txn.id, data: JSON.stringify(txn) }))
  )
  return fullTxns
}
