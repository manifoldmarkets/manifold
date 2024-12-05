import { APIError, type APIHandler } from './helpers/endpoint'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { createLoanIncomeNotification } from 'shared/create-notification'
import { getUser, log } from 'shared/utils'
import { getUserLoanUpdates, isUserEligibleForLoan } from 'common/loans'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
dayjs.extend(utc)
dayjs.extend(timezone)
import { LoanTxn } from 'common/txn'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { filterDefined } from 'common/util/array'
import { getUnresolvedContractMetricsContractsAnswers } from 'shared/update-user-portfolio-histories-core'
import { keyBy } from 'lodash'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'

export const requestLoan: APIHandler<'request-loan'> = async (_, auth) => {
  const pg = createSupabaseDirectClient()
  const { result, metricsByContract, user } = await getNextLoanAmountResults(
    auth.uid
  )
  const { updates, payout } = result
  if (payout < 1) {
    throw new APIError(400, `User ${auth.uid} is not eligible for a loan`)
  }
  const updatedMetrics = filterDefined(
    updates.map((update) => {
      const metric = metricsByContract[update.contractId]?.find(
        (m) => m.answerId == update.answerId
      )
      if (!metric) return undefined
      return {
        ...metric,
        loan: (metric.loan ?? 0) + update.newLoan,
      }
    })
  )
  await pg.tx(async (tx) => {
    await payUserLoan(user.id, payout, tx)
    await bulkUpdateContractMetrics(updatedMetrics, tx)
  })
  log(`Paid out ${payout} to user ${user.id}.`)
  await createLoanIncomeNotification(user, payout)
  return { payout }
}

const payUserLoan = async (
  userId: string,
  payout: number,
  tx: SupabaseTransaction
) => {
  const startOfDay = dayjs()
    .tz('America/Los_Angeles')
    .startOf('day')
    .toISOString()

  // make sure we don't already have a txn for this user/questType
  const { count } = await tx.one(
    `select count(*) from txns
    where to_id = $1
    and category = 'LOAN'
    and created_time >= $2
    limit 1`,
    [userId, startOfDay]
  )

  if (count) {
    throw new APIError(400, 'Already awarded loan today')
  }

  const loanTxn: Omit<LoanTxn, 'fromId' | 'id' | 'createdTime'> = {
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
  await runTxnFromBank(tx, loanTxn, true)
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
  log(`Loaded portfolio.`)

  if (!isUserEligibleForLoan(portfolioMetric)) {
    throw new APIError(400, `User ${userId} is not eligible for a loan`)
  }

  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, `User ${userId} not found`)
  }
  log(`Loaded user ${user.id}`)

  const { contracts, metricsByContract } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [user.id])
  log(`Loaded ${contracts.length} contracts.`)

  const contractsById = keyBy(contracts, 'id')

  const result = getUserLoanUpdates(metricsByContract, contractsById)
  return { result, user, metricsByContract }
}
