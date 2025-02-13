import { Txn } from 'common/txn'
import { isAdminId } from 'common/envs/constants'
import { bulkInsert, getInsertQuery, insert } from 'shared/supabase/utils'
import { APIError } from 'common/api/utils'
import { pgp, SupabaseTransaction } from 'shared/supabase/init'
import { convertTxn } from 'common/supabase/txns'
import { removeUndefinedProps } from 'common/util/object'
import { broadcastUserUpdates } from 'shared/supabase/users'
import { betsQueue } from 'shared/helpers/fn-queue'
import { buildArray } from 'common/util/array'
import { Row } from 'common/supabase/utils'

export type TxnData = Omit<Txn, 'id' | 'createdTime'>

export async function runTxnOutsideBetQueue(
  pgTransaction: SupabaseTransaction,
  data: TxnData,
  affectsProfit = false
) {
  return await runTxnInternal(pgTransaction, data, affectsProfit, false)
}

export async function runTxnInBetQueue(
  pgTransaction: SupabaseTransaction,
  data: TxnData,
  affectsProfit = false
) {
  return await runTxnInternal(pgTransaction, data, affectsProfit, true)
}

// Could also be named: confiscateFunds
export async function runTxnOutsideBetQueueIgnoringBalance(
  pgTransaction: SupabaseTransaction,
  data: TxnData,
  affectsProfit = false
) {
  return await runTxnInternal(pgTransaction, data, affectsProfit, false, false)
}

export async function runAdminTxnOutsideBetQueue(
  pgTransaction: SupabaseTransaction,
  data: TxnData,
  affectsProfit: boolean
) {
  return await runTxnInternal(
    pgTransaction,
    data,
    affectsProfit,
    false,
    false,
    true
  )
}

async function runTxnInternal(
  pgTransaction: SupabaseTransaction,
  data: TxnData,
  affectsProfit = false,
  useQueue = true,
  checkBalance = true,
  isAdmin = false
) {
  const { amount, fromType, fromId, toId, toType, token } = data
  const deps = buildArray(
    (fromType === 'USER' || fromType === 'CONTRACT') && fromId,
    (toType === 'USER' || toType === 'CONTRACT') && toId
  )

  const runTxn = async () => {
    if (!isFinite(amount)) {
      throw new APIError(400, 'Invalid amount')
    }

    if (!isAdminId(fromId) && amount <= 0 && !isAdmin) {
      throw new APIError(400, 'Amount must be positive')
    }

    if (token !== 'M$' && token !== 'CASH') {
      throw new APIError(400, `Invalid token type: ${token}`)
    }

    // Build queries for the multi transaction
    const queries: string[] = []

    if (fromType === 'BANK' || fromType === 'CONTRACT') {
      // Do nothing
    } else if (fromType === 'USER') {
      const balanceField = token === 'CASH' ? 'cash_balance' : 'balance'
      const totalDepositsField =
        token === 'CASH' ? 'total_cash_deposits' : 'total_deposits'
      const totalDepositsLine = `, ${totalDepositsField} = ${totalDepositsField} - $2`
      queries.push(
        pgp.as.format(
          `
          update users 
          set ${balanceField} = ${balanceField} - $2 ${
            affectsProfit ? '' : totalDepositsLine
          }
          where id = $1
          returning id, balance, cash_balance, total_deposits, total_cash_deposits;
        `,
          [fromId, amount]
        )
      )
    } else {
      throw new APIError(
        400,
        `This method does not support transfers from ${fromType}`
      )
    }

    if (toType === 'USER') {
      type userUpdateKey = Partial<
        Pick<
          Row<'users'>,
          'cash_balance' | 'balance' | 'total_cash_deposits' | 'total_deposits'
        >
      >
      const update: userUpdateKey = {}
      if (token === 'CASH') {
        update.cash_balance = amount
        if (!affectsProfit) {
          update.total_cash_deposits = amount
        }
      } else {
        update.balance = amount
        if (!affectsProfit) {
          update.total_deposits = amount
        }
      }

      const setClause = Object.entries(update)
        .map(([field, val]) => `${field} = ${field} + ${val}`)
        .join(', ')

      queries.push(
        pgp.as.format(
          `
          update users 
          set ${setClause}
          where id = $1
          returning id, balance, cash_balance, total_deposits, total_cash_deposits;
        `,
          [toId]
        )
      )
    } else if (
      toType === 'CHARITY' ||
      toType === 'BANK' ||
      toType === 'CONTRACT' ||
      toType === 'AD'
    ) {
      // do nothing
    } else {
      throw new APIError(
        400,
        `This method does not support transfers to ${toType}`
      )
    }

    queries.push(getInsertQuery('txns', txnToRow(data)))
    const results = await pgTransaction.multi(queries.join('\n'))

    // Validate results
    if (fromType === 'USER') {
      const fromUser = results[0][0]
      if (!fromUser) {
        throw new APIError(404, `User ${fromId} not found`)
      }

      if (checkBalance && token === 'CASH' && fromUser.cash_balance < 0) {
        throw new APIError(
          403,
          `Insufficient cash balance: ${
            fromUser.username
          } needed ${amount} but had ${fromUser.cash_balance + amount}`
        )
      } else if (checkBalance && token === 'M$' && fromUser.balance < 0) {
        throw new APIError(
          403,
          `Insufficient balance: ${
            fromUser.username
          } needed ${amount} but had ${fromUser.balance + amount}`
        )
      }
    }

    if (toType === 'USER') {
      const toUser = results[1][0]
      if (!toUser) {
        throw new APIError(404, `User ${toId} not found`)
      }
    }

    const userUpdates = results
      .slice(0, -1)
      .map((r) => r[0])
      .filter(Boolean)
    broadcastUserUpdates(userUpdates)
    const txnRow = results[results.length - 1][0]
    return convertTxn(txnRow)
  }

  if (useQueue) {
    return await betsQueue.enqueueFn(runTxn, deps)
  } else {
    return await runTxn()
  }
}

export async function runTxnFromBank(
  pgTransaction: SupabaseTransaction,
  data: Omit<TxnData, 'fromId'> & { fromType: 'BANK' },
  affectsProfit = false
) {
  return await runTxnInBetQueue(
    pgTransaction,
    { fromId: 'BANK', ...data },
    affectsProfit
  )
}

// inserts into supabase
export async function insertTxn(
  pgTransaction: SupabaseTransaction,
  txn: TxnData
) {
  const row = await insert(pgTransaction, 'txns', txnToRow(txn))
  return convertTxn(row)
}

// bulk insert into supabase
export async function insertTxns(
  pgTransaction: SupabaseTransaction,
  txns: TxnData[]
) {
  await bulkInsert(pgTransaction, 'txns', txns.map(txnToRow))
}

export const txnToRow = (data: TxnData) => {
  return {
    data: JSON.stringify(
      // data is nested an extra level for legacy reasons
      removeUndefinedProps({ data: data.data, description: data.description })
    ),
    amount: data.amount,
    token: data.token,
    from_id: data.fromId,
    to_id: data.toId,
    from_type: data.fromType,
    to_type: data.toType,
    category: data.category,
  } as const
}
