import { Txn } from 'common/txn'
import { isAdminId } from 'common/envs/constants'
import { bulkInsert } from 'shared/supabase/utils'
import { APIError } from 'common/api/utils'
import { SupabaseTransaction } from 'shared/supabase/init'
import { Row } from 'common/supabase/utils'
import { convertTxn } from 'common/supabase/txns'
import { removeUndefinedProps } from 'common/util/object'
import { getUser, log } from 'shared/utils'
import { incrementBalance } from 'shared/supabase/users'

export type TxnData = Omit<Txn, 'id' | 'createdTime'>

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

  if (fromType === 'USER') {
    throw new APIError(400, 'This method is only for transfers from users')
  }

  const fromUser = await getUser(fromId, pgTransaction)

  if (!fromUser) {
    throw new APIError(404, `User ${fromId} not found`)
  }

  if (token === 'SPICE') {
    if (fromUser.spiceBalance < amount) {
      throw new APIError(
        403,
        `Insufficient balance: ${fromUser.username} needed ${amount} but only had ${fromUser.spiceBalance}`
      )
    }

    if (toType === 'USER') {
      const toUser = await getUser(toId, pgTransaction)
      if (!toUser) {
        throw new APIError(404, `User ${toId} not found`)
      }

      await incrementBalance(pgTransaction, toId, {
        spiceBalance: amount,
        totalDeposits: amount,
      })
    } else if (toType === 'CHARITY' || toType === 'BANK') {
      // do nothing
    } else {
      throw new APIError(
        400,
        `This method does not support transfers to ${toType}`
      )
    }

    await incrementBalance(pgTransaction, fromId, {
      spiceBalance: -amount,
      totalDeposits: -amount,
    })
  } else if (token === 'M$') {
    if (fromUser.balance < amount) {
      throw new APIError(
        403,
        `Insufficient balance: ${fromUser.username} needed ${amount} but only had ${fromUser.balance}`
      )
    }

    if (toType === 'USER') {
      const toUser = await getUser(toId, pgTransaction)
      if (!toUser) {
        throw new APIError(404, `User ${toId} not found`)
      }

      await incrementBalance(pgTransaction, toId, {
        balance: amount,
        totalDeposits: amount,
      })
    } else if (toType === 'CHARITY' || toType === 'BANK') {
      // do nothing
    } else {
      throw new APIError(
        400,
        `This method does not support transfers to ${toType}`
      )
    }

    await incrementBalance(pgTransaction, fromId, {
      balance: -amount,
      totalDeposits: -amount,
    })
  } else {
    throw new APIError(400, `Invalid token type: ${token}`)
  }

  const txn = await insertTxn(pgTransaction, data)
  return txn
}

export async function runTxnFromBank(
  pgTransaction: SupabaseTransaction,
  data: Omit<TxnData, 'fromId'> & { fromType: 'BANK' },
  affectsProfit = false
) {
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

  if (toType === 'USER') {
    const update: {
      balance?: number
      spiceBalance?: number
      totalDeposits?: number
    } = {}

    if (token === 'SPICE') {
      update.spiceBalance = amount
    } else {
      update.balance = amount
    }

    if (!affectsProfit) {
      update.totalDeposits = amount
    }

    await incrementBalance(pgTransaction, toId, update)
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
