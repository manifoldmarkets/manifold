import * as admin from 'firebase-admin'
import { User } from 'common/user'
import { FieldValue } from 'firebase-admin/firestore'
import { Txn } from 'common/txn'
import { isAdminId } from 'common/envs/constants'
import { bulkInsert } from 'shared/supabase/utils'
import { APIError } from 'common/api/utils'
import { SupabaseTransaction } from 'shared/supabase/init'
import { Row } from 'common/supabase/utils'
import { convertTxn } from 'common/supabase/txns'
import { removeUndefinedProps } from 'common/util/object'
import { log } from 'shared/utils'

export type TxnData = Omit<Txn, 'id' | 'createdTime'>

/** This creates an firestore transaction within. DO NOT run within another firestore transaction! */
export async function runTxn(
  pgTransaction: SupabaseTransaction,
  data: TxnData & { fromType: 'USER' }
) {
  const { amount, fromType, fromId, toId, toType, token } = data

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

  await firestore.runTransaction(async (fbTransaction) => {
    const fromDoc = firestore.doc(`users/${fromId}`)
    const fromSnap = await fbTransaction.get(fromDoc)
    if (!fromSnap.exists) {
      throw new APIError(404, 'User not found')
    }
    const fromUser = fromSnap.data() as User

    if (token === 'SPICE') {
      if (fromUser.spiceBalance < amount) {
        throw new APIError(
          403,
          `Insufficient balance: ${fromUser.username} needed ${amount} but only had ${fromUser.spiceBalance}`
        )
      }

      // TODO: Track payments received by charities, bank, contracts too.
      if (toType === 'USER') {
        const toDoc = firestore.doc(`users/${toId}`)
        fbTransaction.update(toDoc, {
          spiceBalance: FieldValue.increment(amount),
          totalDeposits: FieldValue.increment(amount),
        })
      }

      fbTransaction.update(fromDoc, {
        spiceBalance: FieldValue.increment(-amount),
        totalDeposits: FieldValue.increment(-amount),
      })
    } else if (token === 'M$') {
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
    } else {
      throw new APIError(400, `Invalid token type: ${token}`)
    }
  })

  const txn = await insertTxn(pgTransaction, data)

  return txn
}

/** This does a firestore write within. DO NOT run within another firestore transaction! */
export async function runTxnFromBank(pgTransaction: SupabaseTransaction, data: Omit<TxnData, 'fromId'> & {
    fromType: 'BANK'
  }
, affectsProfit = false) {
  const firestore = admin.firestore()
  const { amount, fromType, toId, toType, token } = data
  if (fromType !== 'BANK') {
    throw new APIError(400, 'This method is only for transfers from banks')
  }

  if (!isFinite(amount) || amount <= 0) {
    throw new APIError(400, 'Invalid amount')
  }

  if (token !== 'SPICE' && token !== 'M$') {
    throw new APIError(400, `Invalid token type: ${token}`)
  }

  const update: { [key: string]: any } = {}

  if (token === 'SPICE') {
    update.spiceBalance = FieldValue.increment(amount)
  } else {
    update.balance = FieldValue.increment(amount)
  }

  if (!affectsProfit) {
    update.totalDeposits = FieldValue.increment(amount)
  }

  if (toType === 'USER') {
    await firestore.doc(`users/${toId}`).update(update)
  }

  return await insertTxn(pgTransaction, { fromId: 'BANK', ...data })
}

// inserts into supabase
export async function insertTxn(
  pgTransaction: SupabaseTransaction,
  txn: TxnData
) {
  const row = await pgTransaction
    .one<Row<'txns'>>(
      `insert into txns 
      (data, amount, from_id, to_id, from_type, to_type, category) 
      values ($1, $2, $3, $4, $5, $6, $7) 
      returning *`,
      [
        JSON.stringify(removeUndefinedProps(txn)),
        txn.amount,
        txn.fromId,
        txn.toId,
        txn.fromType,
        txn.toType,
        txn.category,
      ]
    )
    .catch((e) => {
      logFailedToRecordTxn(txn)
      throw e
    })

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
      data: JSON.stringify(removeUndefinedProps(txn)),
      amount: txn.amount,
      from_id: txn.fromId,
      to_id: txn.toId,
      from_type: txn.fromType,
      to_type: txn.toType,
      category: txn.category,
    }))
  ).catch((e) => {
    for (const txn of txns) {
      logFailedToRecordTxn(txn)
    }
    throw e
  })
}

export function logFailedToRecordTxn(txn: TxnData) {
  log.error(
    `Failed to record ${txn.category} txn: send ${txn.amount} from ${txn.fromType} ${txn.fromId} to ${txn.toType} ${txn.toId}`,
    txn
  )
}
