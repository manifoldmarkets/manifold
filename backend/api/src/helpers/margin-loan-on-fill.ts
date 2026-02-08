import { SupabaseTransaction } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  calculateMaxGeneralLoanAmount,
  calculateDailyLoanLimit,
  distributeLoanProportionally,
  isMarketEligibleForLoan,
  getMidnightPacific,
  MS_PER_DAY,
  calculateEquity,
} from 'common/loans'
import { MarginLoanTxn } from 'common/txn'
import { txnToRow } from 'shared/txn/run-txn'
import { filterDefined } from 'common/util/array'
import { keyBy } from 'lodash'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { getInsertQuery } from 'shared/supabase/utils'
import { bulkIncrementBalancesQuery } from 'shared/supabase/users'
import {
  getLoanTrackingRows,
  upsertLoanTrackingQuery,
  LoanTrackingRow,
} from 'shared/helpers/user-contract-loans'
import { bulkUpdateContractMetricsQuery } from 'shared/helpers/user-contract-metrics'
import {
  canAccessMarginLoans,
  getMaxLoanNetWorthPercent,
  SUPPORTER_ENTITLEMENT_IDS,
} from 'common/supporter-config'
import { convertEntitlement } from 'common/shop/types'
import { Contract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'

export type MarginLoanOnFillResult = {
  success: boolean
  amount: number
  reason?: string
  queries?: string[]
}

/**
 * Attempt to take out a margin loan for a user when their limit order is being filled
 * and they have insufficient balance.
 *
 * This uses the same mechanism as the request-loan API but is designed to run
 * within an existing transaction during bet filling.
 *
 * @param pgTrans - The database transaction
 * @param userId - The user who needs the loan
 * @param requestedAmount - The amount of loan needed
 * @returns Result indicating success/failure and any queries to execute
 */
export async function attemptMarginLoanOnFill(
  pgTrans: SupabaseTransaction,
  userId: string,
  requestedAmount: number
): Promise<MarginLoanOnFillResult> {
  if (requestedAmount <= 0) {
    return { success: false, amount: 0, reason: 'Invalid loan amount' }
  }

  // Check if loans are globally enabled
  const loanStatus = await pgTrans.oneOrNone<{ status: boolean }>(
    `SELECT status FROM system_trading_status WHERE token = 'LOAN'`
  )
  if (loanStatus && !loanStatus.status) {
    return { success: false, amount: 0, reason: 'Loans are currently disabled' }
  }

  // Check if user has margin loan access
  const supporterEntitlementRows = await pgTrans.manyOrNone<{
    user_id: string
    entitlement_id: string
    granted_time: string
    expires_time: string | null
    enabled: boolean
  }>(
    `SELECT user_id, entitlement_id, granted_time, expires_time, enabled
     FROM user_entitlements
     WHERE user_id = $1
     AND entitlement_id = ANY($2)
     AND enabled = true
     AND (expires_time IS NULL OR expires_time > NOW())`,
    [userId, [...SUPPORTER_ENTITLEMENT_IDS]]
  )
  const entitlements = supporterEntitlementRows.map(convertEntitlement)

  if (!canAccessMarginLoans(entitlements)) {
    return {
      success: false,
      amount: 0,
      reason: 'User does not have margin loan access',
    }
  }

  // Get tier-specific max loan percent
  const maxLoanPercent = getMaxLoanNetWorthPercent(entitlements)

  // Get user's portfolio metrics
  const portfolioMetric = await pgTrans.oneOrNone(
    `select *
     from user_portfolio_history_latest
     where user_id = $1`,
    [userId],
    convertPortfolioHistory
  )
  if (!portfolioMetric) {
    return { success: false, amount: 0, reason: 'No portfolio found for user' }
  }

  // Get user's unresolved metrics and contracts
  const metricsAndContracts = await pgTrans.manyOrNone<{
    metric_data: ContractMetric
    contract_data: Contract
    margin_loan: number
    loan: number
  }>(
    `SELECT 
      ucm.data as metric_data,
      ucm.margin_loan,
      ucm.loan,
      c.data as contract_data
     FROM user_contract_metrics ucm
     JOIN contracts c ON ucm.contract_id = c.id
     WHERE ucm.user_id = $1
     AND NOT c.resolution_time IS NOT NULL
     AND c.data->>'token' = 'MANA'`,
    [userId]
  )

  const metrics: ContractMetric[] = metricsAndContracts.map((r) => ({
    ...r.metric_data,
    marginLoan: r.margin_loan ?? r.metric_data.marginLoan ?? 0,
    loan: r.loan ?? r.metric_data.loan ?? 0,
  }))
  const contractsById = keyBy(
    metricsAndContracts.map((r) => r.contract_data),
    'id'
  )

  // Calculate portfolio value from unresolved MANA positions
  const portfolioValue = metrics.reduce((sum, m) => {
    const contract = contractsById[m.contractId]
    if (!contract) return sum
    return sum + (m.payout ?? 0)
  }, 0)

  // Calculate equity
  const loanTotal = portfolioMetric.loanTotal ?? 0
  const equity = calculateEquity(portfolioValue, loanTotal)

  if (equity <= 0) {
    return {
      success: false,
      amount: 0,
      reason: 'User has no equity to borrow against',
    }
  }

  // Calculate max loan and available loan
  const maxLoan = calculateMaxGeneralLoanAmount(equity, maxLoanPercent)
  const currentLoan = loanTotal
  const maxAvailableLoan = Math.max(0, maxLoan - currentLoan)

  if (maxAvailableLoan <= 0) {
    return {
      success: false,
      amount: 0,
      reason: 'User has reached maximum loan limit',
    }
  }

  // Check daily loan limit
  const dailyLimit = calculateDailyLoanLimit(equity)
  const midnightPT = getMidnightPacific()
  const todayLoansResult = await pgTrans.oneOrNone<{ total: number }>(
    `select coalesce(sum(amount), 0) as total
     from txns
     where to_id = $1
     and category IN ('MARGIN_LOAN', 'LOAN')
     and created_time >= $2`,
    [userId, midnightPT.toISOString()]
  )
  const todayLoans = todayLoansResult?.total ?? 0
  const availableToday = Math.max(0, dailyLimit - todayLoans)

  // Calculate the actual loan amount (minimum of requested, max available, daily available)
  const actualLoanAmount = Math.min(
    requestedAmount,
    maxAvailableLoan,
    availableToday
  )

  if (actualLoanAmount <= 0) {
    return {
      success: false,
      amount: 0,
      reason: 'Daily loan limit exceeded',
    }
  }

  // Filter to only unresolved MANA markets that meet eligibility criteria
  const unresolvedManaMetrics = metrics.filter((m) => {
    const contract = contractsById[m.contractId]
    if (!contract || contract.isResolved || contract.token !== 'MANA') {
      return false
    }
    return isMarketEligibleForLoan({
      visibility: contract.visibility,
      isRanked: contract.isRanked,
      uniqueBettorCount: contract.uniqueBettorCount,
      createdTime: contract.createdTime,
    }).eligible
  })

  if (unresolvedManaMetrics.length === 0) {
    return {
      success: false,
      amount: 0,
      reason: 'No eligible markets to distribute loan across',
    }
  }

  // Distribute loan proportionally
  const distributions = distributeLoanProportionally(
    actualLoanAmount,
    unresolvedManaMetrics
  )

  if (distributions.length === 0) {
    return {
      success: false,
      amount: 0,
      reason: 'No markets with investment to distribute loan across',
    }
  }

  const now = Date.now()

  // Build updated metrics
  const metricsById = keyBy(metrics, (m) => `${m.contractId}-${m.answerId ?? ''}`)
  const updatedMetrics = filterDefined(
    distributions.map((dist) => {
      const key = `${dist.contractId}-${dist.answerId ?? ''}`
      const metric = metricsById[key]
      if (!metric) return undefined

      return {
        ...metric,
        marginLoan: (metric.marginLoan ?? 0) + dist.loanAmount,
      }
    })
  )

  // Get existing loan tracking data
  const contractIds = [...new Set(distributions.map((d) => d.contractId))]
  const existingLoanTracking = await getLoanTrackingRows(
    pgTrans,
    userId,
    contractIds
  )
  const trackingByKey = keyBy(
    existingLoanTracking,
    (t) => `${t.contract_id}-${t.answer_id ?? ''}`
  )

  // Build loan tracking updates
  const loanTrackingUpdates: Omit<LoanTrackingRow, 'id'>[] = []
  for (const dist of distributions) {
    const key = `${dist.contractId}-${dist.answerId ?? ''}`
    const tracking = trackingByKey[key]
    const metric = metricsById[key]
    const oldLoan = metric?.marginLoan ?? 0
    const lastUpdate = tracking?.last_loan_update_time ?? now
    const daysSinceLastUpdate = (now - lastUpdate) / MS_PER_DAY
    const newIntegral =
      (tracking?.loan_day_integral ?? 0) + oldLoan * daysSinceLastUpdate

    loanTrackingUpdates.push({
      user_id: userId,
      contract_id: dist.contractId,
      answer_id: dist.answerId,
      loan_day_integral: newIntegral,
      last_loan_update_time: now,
    })
  }

  // Build queries
  const bulkUpdateContractMetricsQ = bulkUpdateContractMetricsQuery(updatedMetrics)
  const loanTrackingQ = upsertLoanTrackingQuery(loanTrackingUpdates)
  const { txnQuery, balanceUpdateQuery } = createLoanQueries(
    userId,
    actualLoanAmount
  )

  log(
    `User ${userId} taking margin loan of ${actualLoanAmount} on limit order fill`
  )

  return {
    success: true,
    amount: actualLoanAmount,
    queries: [
      balanceUpdateQuery,
      txnQuery,
      bulkUpdateContractMetricsQ,
      loanTrackingQ,
    ],
  }
}

function createLoanQueries(userId: string, payout: number) {
  const loanTxn: Omit<MarginLoanTxn, 'id' | 'createdTime'> = {
    fromId: 'BANK',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    amount: payout,
    token: 'M$',
    category: 'MARGIN_LOAN',
    data: {
      countsAsProfit: true,
      source: 'limit-order-fill',
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
