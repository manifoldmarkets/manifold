import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient, pgp } from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import {
  calculateMaxGeneralLoanAmount,
  calculateDailyLoanLimit,
  calculateMarketLoanMax,
  calculatePositionFreeLoan,
  canClaimDailyFreeLoan,
  isMarketEligibleForLoan,
  getMidnightPacific,
} from 'common/loans'
import { Txn } from 'common/txn'
import { txnToRow } from 'shared/txn/run-txn'
import { filterDefined } from 'common/util/array'
import {
  getUnresolvedContractMetricsContractsAnswers,
  getUnresolvedStatsForToken,
} from 'shared/update-user-portfolio-histories-core'
import { keyBy, sumBy } from 'lodash'
import { getInsertQuery } from 'shared/supabase/utils'
import {
  broadcastUserUpdates,
  bulkIncrementBalancesQuery,
  UserUpdate,
} from 'shared/supabase/users'
import { betsQueue } from 'shared/helpers/fn-queue'
import { bulkUpdateContractMetricsQuery } from 'shared/helpers/user-contract-metrics'

export const claimFreeLoan: APIHandler<'claim-free-loan'> = async (_, auth) => {
  const pg = createSupabaseDirectClient()
  const userId = auth.uid

  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, `User ${userId} not found`)
  }

  // Check if loans are globally disabled
  const loanStatus = await pg.oneOrNone<{ status: boolean }>(
    `SELECT status FROM system_trading_status WHERE token = 'LOAN'`
  )
  if (loanStatus?.status === false) {
    throw new APIError(503, 'Free loans are temporarily disabled')
  }

  // Get last claim time
  const lastClaimResult = await pg.oneOrNone<{ last_free_loan_claim: Date }>(
    `SELECT last_free_loan_claim FROM users WHERE id = $1`,
    [userId]
  )
  const lastClaimTime = lastClaimResult?.last_free_loan_claim ?? null

  // Check if user can claim (hasn't claimed since midnight PT)
  if (!canClaimDailyFreeLoan(lastClaimTime)) {
    throw new APIError(
      400,
      'You have already claimed your daily free loan today'
    )
  }

  // Get all unresolved contract metrics and contracts
  const { metrics, contracts } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [userId])
  const contractsById = keyBy(contracts, 'id')

  // Calculate net worth
  const { value } = getUnresolvedStatsForToken('MANA', metrics, contractsById)
  const netWorth = user.balance + value

  // Calculate limits
  const maxLoan = calculateMaxGeneralLoanAmount(netWorth)
  const dailyLimit = calculateDailyLoanLimit(netWorth)

  // Get today's loans (since midnight PT)
  const midnightPT = getMidnightPacific()
  const todayLoansResult = await pg.oneOrNone<{ total: number }>(
    `select coalesce(sum(amount), 0) as total
     from txns
     where to_id = $1
     and category IN ('LOAN', 'DAILY_FREE_LOAN')
     and created_time >= $2`,
    [userId, midnightPT.toISOString()]
  )
  const todayLoans = todayLoansResult?.total ?? 0

  // Filter to eligible MANA markets with positions
  const eligibleMetrics = metrics.filter((m) => {
    const contract = contractsById[m.contractId]
    if (!contract) return false
    if (contract.token !== 'MANA') return false
    if (contract.isResolved) return false
    if ((m.payout ?? 0) <= 0 && (m.invested ?? 0) <= 0) return false

    // Check market eligibility
    const eligibility = isMarketEligibleForLoan({
      visibility: contract.visibility,
      isRanked: contract.isRanked,
      uniqueBettorCount: contract.uniqueBettorCount ?? 0,
      createdTime: contract.createdTime,
    })
    return eligibility.eligible
  })

  if (eligibleMetrics.length === 0) {
    throw new APIError(400, 'No eligible positions to claim free loan on')
  }

  // Calculate per-market/per-answer limits
  // For sums-to-one markets: limit applies to total across all answers (shared liquidity pool)
  // For independent markets: limit applies per answer

  // Group metrics by contractId
  const metricsGroupedByContract: Record<string, typeof metrics> = {}
  for (const m of metrics) {
    if (!metricsGroupedByContract[m.contractId]) {
      metricsGroupedByContract[m.contractId] = []
    }
    metricsGroupedByContract[m.contractId].push(m)
  }

  // Calculate loan info - for sums-to-one markets, aggregate across all answers
  // For independent markets, calculate per-answer
  type LoanLimitInfo = {
    currentLoan: number
    positionValue: number
    maxLoan: number
    remainingCapacity: number
  }

  // Per-market aggregate info (for sums-to-one markets)
  const marketLoanInfo: Record<string, LoanLimitInfo> = {}
  // Per-answer info (for independent markets)
  const answerLoanInfo: Record<string, LoanLimitInfo> = {}

  for (const contractId in metricsGroupedByContract) {
    const contractMetrics = metricsGroupedByContract[contractId]
    const contract = contractsById[contractId]
    const isIndependent =
      contract?.mechanism === 'cpmm-multi-1' && !contract?.shouldAnswersSumToOne

    if (isIndependent) {
      // For independent markets, calculate limits per answer
      for (const m of contractMetrics) {
        const key = `${m.contractId}-${m.answerId ?? ''}`
        const currentLoan = (m.loan ?? 0) + (m.marginLoan ?? 0)
        const positionValue = m.payout ?? 0
        const maxLoan = calculateMarketLoanMax(netWorth)
        answerLoanInfo[key] = {
          currentLoan,
          positionValue,
          maxLoan,
          remainingCapacity: Math.max(0, maxLoan - currentLoan),
        }
      }
    } else {
      // For sums-to-one markets, aggregate across all answers
      const currentLoan = sumBy(
        contractMetrics,
        (m) => (m.loan ?? 0) + (m.marginLoan ?? 0)
      )
      const positionValue = sumBy(contractMetrics, (m) => m.payout ?? 0)
      const maxLoan = calculateMarketLoanMax(netWorth)
      marketLoanInfo[contractId] = {
        currentLoan,
        positionValue,
        maxLoan,
        remainingCapacity: Math.max(0, maxLoan - currentLoan),
      }
    }
  }

  // Calculate free loan per position, capped by appropriate limit
  const positionFreeLoan = eligibleMetrics.map((m) => {
    const baseFreeLoan = calculatePositionFreeLoan(
      m.payout ?? 0,
      m.invested ?? 0
    )

    const contract = contractsById[m.contractId]
    const isIndependent =
      contract?.mechanism === 'cpmm-multi-1' && !contract?.shouldAnswersSumToOne

    if (isIndependent) {
      // For independent markets, use per-answer limit
      const key = `${m.contractId}-${m.answerId ?? ''}`
      const info = answerLoanInfo[key]
      if (!info) {
        return { metric: m, freeLoan: baseFreeLoan }
      }
      const freeLoan = Math.min(baseFreeLoan, info.remainingCapacity)
      // Reduce remaining capacity for this answer
      info.remainingCapacity = Math.max(0, info.remainingCapacity - freeLoan)
      return { metric: m, freeLoan }
    } else {
      // For sums-to-one markets, use per-market limit (shared capacity)
      const info = marketLoanInfo[m.contractId]
      if (!info) {
        return { metric: m, freeLoan: baseFreeLoan }
      }
      const freeLoan = Math.min(baseFreeLoan, info.remainingCapacity)
      // Reduce remaining capacity for this market
      info.remainingCapacity = Math.max(0, info.remainingCapacity - freeLoan)
      return { metric: m, freeLoan }
    }
  })

  // Sum up current loans
  const currentFreeLoan = sumBy(metrics, (m) => m.loan ?? 0)
  const currentMarginLoan = sumBy(metrics, (m) => m.marginLoan ?? 0)
  const totalLoan = currentFreeLoan + currentMarginLoan

  // Calculate total free loan available (before applying limits)
  const totalFreeLoanAvailable = sumBy(positionFreeLoan, (p) => p.freeLoan)

  // Apply limits
  const availableUnderCap = Math.max(0, maxLoan - totalLoan)
  const availableToday = Math.max(0, dailyLimit - todayLoans)
  const amount = Math.min(
    totalFreeLoanAvailable,
    availableUnderCap,
    availableToday
  )

  if (amount < 1) {
    throw new APIError(400, 'No free loan available to claim (minimum 1 mana)')
  }

  // Distribute proportionally by free loan contribution
  const totalContribution = sumBy(positionFreeLoan, (p) => p.freeLoan)
  const distributions = filterDefined(
    positionFreeLoan.map((p) => {
      if (p.freeLoan <= 0) return undefined
      const proportion = p.freeLoan / totalContribution
      const loanAmount = amount * proportion
      if (loanAmount <= 0) return undefined
      return {
        contractId: p.metric.contractId,
        answerId: p.metric.answerId,
        loanAmount,
      }
    })
  )

  // Update metrics - increment loan field (NOT marginLoan)
  const metricsById = keyBy(
    eligibleMetrics,
    (m) => `${m.contractId}-${m.answerId ?? ''}`
  )
  const updatedMetrics = filterDefined(
    distributions.map((dist) => {
      const key = `${dist.contractId}-${dist.answerId ?? ''}`
      const metric = metricsById[key]
      if (!metric) return undefined
      return {
        ...metric,
        loan: (metric.loan ?? 0) + dist.loanAmount,
        // marginLoan stays unchanged
      }
    })
  )

  // Create transaction for the loan
  const txn: Omit<Txn, 'id' | 'createdTime'> = {
    category: 'DAILY_FREE_LOAN',
    fromType: 'BANK',
    fromId: 'BANK',
    toType: 'USER',
    toId: userId,
    amount,
    token: 'M$',
    data: {
      distributions: distributions.map((d) => ({
        contractId: d.contractId,
        answerId: d.answerId,
        amount: d.loanAmount,
      })),
    },
    description: 'Daily free loan claim',
  }

  const txnQuery = getInsertQuery('txns', txnToRow(txn))
  const balanceUpdateQuery = bulkIncrementBalancesQuery([
    { id: userId, balance: amount },
  ])
  const bulkUpdateMetricsQ = bulkUpdateContractMetricsQuery(updatedMetrics)
  const updateLastClaimQuery = pgp.as.format(
    `UPDATE users SET last_free_loan_claim = NOW() WHERE id = $1`,
    [userId]
  )

  const { userUpdates } = await betsQueue.enqueueFn(async () => {
    return pg.tx(async (tx) => {
      const res = await tx.multi(
        `${balanceUpdateQuery};
         ${txnQuery};
         ${bulkUpdateMetricsQ};
         ${updateLastClaimQuery}`
      )
      const userUpdates = res[0] as UserUpdate[]
      return { userUpdates }
    })
  }, [userId])

  broadcastUserUpdates(userUpdates)
  log(`User ${userId} claimed daily free loan of ${amount}`)

  return {
    success: true,
    amount,
    distributed: distributions.map((d) => ({
      contractId: d.contractId,
      answerId: d.answerId,
      amount: d.loanAmount,
    })),
  }
}
