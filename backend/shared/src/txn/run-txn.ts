import * as admin from 'firebase-admin'
import { User } from 'common/user'
import { FieldValue } from 'firebase-admin/firestore'
import { Txn } from 'common/txn'
import { isAdminId } from 'common/envs/constants'
import { bulkInsert } from 'shared/supabase/utils'
import { APIError } from 'common/api/utils'
import { SupabaseTransaction } from 'shared/supabase/init'
import { log } from 'shared/log'
import { Row } from 'common/supabase/utils'
import { convertTxn } from 'common/supabase/txns'

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

  const txn = await insertTxn(pgTransaction, data)

  await firestore
    .runTransaction(async (fbTransaction) => {
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
    })
    .catch((e) => {
      logFailedTxn(txn)
      throw e
    })

  return txn
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

  const txn = await insertTxn(pgTransaction, { fromId: 'BANK', ...data })

  if (toType === 'USER') {
    await firestore
      .doc(`users/${toId}`)
      .update({
        balance: FieldValue.increment(amount),
        ...(affectsProfit
          ? {}
          : { totalDeposits: FieldValue.increment(amount) }),
      })
      .catch((e) => {
        logFailedTxn(txn)
        throw e
      })
  }

  return txn
}

// inserts into supabase
export async function insertTxn(
  pgTransaction: SupabaseTransaction,
  txn: TxnData
) {
  const row = await pgTransaction.one<Row<'txns'>>(
    `insert into txns 
    (data, amount, from_id, to_id, from_type, to_type, category, token) 
    values ($1, $2, $3, $4, $5, $6, $7, $8) 
    returning *`,
    [
      JSON.stringify(txn),
      txn.amount,
      txn.fromId,
      txn.toId,
      txn.fromType,
      txn.toType,
      txn.category,
      txn.token,
    ]
  )
  return convertTxn(row)
}

// bulk insert into supabase
export async function insertTxns(
  pgTransaction: SupabaseTransaction,
  txns: TxnData[]
) {
  await bulkInsert(
    pgTransaction,
    'txns',
    txns.map((txn) => ({
      data: JSON.stringify(txn),
      amount: txn.amount,
      from_id: txn.fromId,
      to_id: txn.toId,
      from_type: txn.fromType,
      to_type: txn.toType,
      category: txn.category,
      token: txn.token,
    }))
  )
}

/** Throw if insert succeeds but*/
export function logFailedTxn(txn: Txn) {
  log.error(
    `Failed to run ${txn.category} txn ${txn.id}: send ${txn.amount} from ${txn.fromType} ${txn.fromId} to ${txn.toId} `
  )
}
