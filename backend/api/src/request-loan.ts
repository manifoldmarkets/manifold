import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { createLoanIncomeNotification } from 'shared/create-notification'
import { getUser, log } from 'shared/utils'
import { getUserLoanUpdates, isUserEligibleForLoan } from 'common/loans'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import { bulkUpdateContractMetricsQuery } from 'shared/helpers/user-contract-metrics'
dayjs.extend(utc)
dayjs.extend(timezone)
import { LoanTxn } from 'common/txn'
import { txnToRow } from 'shared/txn/run-txn'
import { filterDefined } from 'common/util/array'
import {
  getUnresolvedContractMetricsContractsAnswers,
  getUnresolvedStatsForToken,
} from 'shared/update-user-portfolio-histories-core'
import { keyBy } from 'lodash'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { getInsertQuery } from 'shared/supabase/utils'
import {
  broadcastUserUpdates,
  bulkIncrementBalancesQuery,
  UserUpdate,
} from 'shared/supabase/users'
import { betsQueue } from 'shared/helpers/fn-queue'

export const requestLoan: APIHandler<'request-loan'> = async (_, auth) => {
  const pg = createSupabaseDirectClient()
  const { result, updatedMetricsByContract, user } =
    await getNextLoanAmountResults(auth.uid)
  const { updates, payout } = result
  if (payout < 1) {
    throw new APIError(400, `User ${auth.uid} is not eligible for a loan`)
  }
  const updatedMetrics = filterDefined(
    updates.map((update) => {
      const metric = updatedMetricsByContract[update.contractId]?.find(
        (m) => m.answerId == update.answerId
      )
      if (!metric) return undefined
      return {
        ...metric,
        loan: (metric.loan ?? 0) + update.newLoan,
      }
    })
  )
  const bulkUpdateContractMetricsQ =
    bulkUpdateContractMetricsQuery(updatedMetrics)
  const { txnQuery, balanceUpdateQuery } = payUserLoan(user.id, payout)

  const { userUpdates } = await betsQueue.enqueueFn(async () => {
    const startOfDay = dayjs()
      .tz('America/Los_Angeles')
      .startOf('day')
      .toISOString()

    const res = await pg.oneOrNone(
      `select 1 as count from txns
      where to_id = $1
      and category = 'LOAN'
      and created_time >= $2
      limit 1;
    `,
      [auth.uid, startOfDay]
    )
    if (res) {
      throw new APIError(400, 'Already awarded loan today')
    }
    return pg.tx(async (tx) => {
      const res = await tx.multi(
        `${balanceUpdateQuery};
         ${txnQuery};
         ${bulkUpdateContractMetricsQ}`
      )
      const userUpdates = res[0] as UserUpdate[]
      return { userUpdates }
    })
  }, [auth.uid])
  broadcastUserUpdates(userUpdates)
  log(`Paid out ${payout} to user ${user.id}.`)
  await createLoanIncomeNotification(user, payout)
  return result
}

const payUserLoan = (userId: string, payout: number) => {
  const loanTxn: Omit<LoanTxn, 'id' | 'createdTime'> = {
    fromId: 'BANK',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    amount: payout,
    token: 'M$',
    category: 'LOAN',
    data: {
      // Distinguishes correct loans from erroneous old loans that were marked as deposits instead of profit.
      countsAsProfit: true,
    },
  }
  const balanceUpdate = {
    id: loanTxn.toId,
    balance: payout,
  }
  const balanceUpdateQuery = bulkIncrementBalancesQuery([balanceUpdate])
  const txnQuery = getInsertQuery('txns', txnToRow(loanTxn))
  return {
    txnQuery,
    balanceUpdateQuery,
  }
}

export const getNextLoanAmountResults = async (userId: string) => {
  const pg = createSupabaseDirectClient()

  const portfolioMetric = await pg.oneOrNone(
    `select *
     from user_portfolio_history_latest
     where user_id = $1`,
    [userId],
    convertPortfolioHistory
  )
  if (!portfolioMetric) {
    throw new APIError(404, `No portfolio found for user ${userId}`)
  }

  if (!isUserEligibleForLoan(portfolioMetric)) {
    throw new APIError(400, `User ${userId} is not eligible for a loan`)
  }

  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, `User ${userId} not found`)
  }

  const { contracts, updatedMetricsByContract, metrics } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [user.id])
  const contractsById = keyBy(contracts, 'id')
  const { value } = getUnresolvedStatsForToken('MANA', metrics, contractsById)
  const netWorth = user.balance + value
  const result = getUserLoanUpdates(
    updatedMetricsByContract,
    contractsById,
    netWorth
  )
  return { result, user, updatedMetricsByContract }
}
