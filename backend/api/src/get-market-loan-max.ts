import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, getContract } from 'shared/utils'
import {
  calculateMarketLoanMax,
  calculateMaxGeneralLoanAmount,
  calculateDailyLoanLimit,
  MAX_MARKET_LOAN_NET_WORTH_PERCENT,
  MAX_MARKET_LOAN_POSITION_PERCENT,
  MS_PER_DAY,
  isMarketEligibleForLoan,
} from 'common/loans'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'
import {
  getUnresolvedContractMetricsContractsAnswers,
  getUnresolvedStatsForToken,
} from 'shared/update-user-portfolio-histories-core'
import { keyBy, sumBy } from 'lodash'
import { APIError } from './helpers/endpoint'

export const getMarketLoanMax: APIHandler<'get-market-loan-max'> = async (
  props,
  auth
) => {
  const { contractId, answerId } = props
  const pg = createSupabaseDirectClient()

  const user = await getUser(auth.uid)
  if (!user) {
    throw new APIError(404, `User ${auth.uid} not found`)
  }

  const contract = await getContract(pg, contractId)
  if (!contract) {
    throw new APIError(404, `Contract ${contractId} not found`)
  }

  if (!('mechanism' in contract)) {
    throw new APIError(400, 'Contract must be a market contract')
  }

  // Check market eligibility for new loans
  const eligibility = isMarketEligibleForLoan({
    visibility: contract.visibility,
    isRanked: contract.isRanked,
    uniqueBettorCount: contract.uniqueBettorCount,
    createdTime: contract.createdTime,
  })

  // Get user's portfolio for total loan across all markets
  const portfolioMetric = await pg.oneOrNone(
    `select *
     from user_portfolio_history_latest
     where user_id = $1`,
    [auth.uid],
    convertPortfolioHistory
  )
  const totalLoanAllMarkets = portfolioMetric?.loanTotal ?? 0

  // Get user's metrics for this contract and calculate net worth
  const { metrics, contracts } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [user.id])
  const contractsById = keyBy(contracts, 'id')
  const { value } = getUnresolvedStatsForToken('MANA', metrics, contractsById)
  const netWorth = user.balance + value

  // Get metrics for this contract
  const contractMetrics = metrics.filter((m) => m.contractId === contractId)

  // If answerId is provided, filter to just that answer (for independent/set markets)
  // Otherwise, aggregate all answers (for sums-to-one markets or market-level view)
  const relevantMetrics = answerId
    ? contractMetrics.filter((m) => m.answerId === answerId)
    : contractMetrics

  const currentFreeLoan = sumBy(relevantMetrics, (m) => m.loan ?? 0)
  const currentMarginLoan = sumBy(relevantMetrics, (m) => m.marginLoan ?? 0)
  const currentLoan = currentFreeLoan + currentMarginLoan
  const totalPositionValue = sumBy(relevantMetrics, (m) => m.payout ?? 0)

  // Calculate per-market limits
  const netWorthLimit = netWorth * MAX_MARKET_LOAN_NET_WORTH_PERCENT
  const positionLimit = totalPositionValue * MAX_MARKET_LOAN_POSITION_PERCENT
  const maxLoan = calculateMarketLoanMax(netWorth, totalPositionValue)

  // Calculate aggregate limit (80% of net worth total across ALL markets)
  const maxAggregateLoan = calculateMaxGeneralLoanAmount(netWorth)
  const availableAggregate = Math.max(0, maxAggregateLoan - totalLoanAllMarkets)

  // Calculate daily limit (10% of net worth per day)
  const dailyLimit = calculateDailyLoanLimit(netWorth)
  const oneDayAgo = Date.now() - MS_PER_DAY
  const todayLoansResult = await pg.oneOrNone<{ total: number }>(
    `select coalesce(sum(amount), 0) as total
     from txns
     where to_id = $1
     and category = 'LOAN'
     and created_time >= $2`,
    [auth.uid, new Date(oneDayAgo).toISOString()]
  )
  const todayLoans = todayLoansResult?.total ?? 0
  const availableToday = Math.max(0, dailyLimit - todayLoans)

  // Available is the minimum of:
  // 1. Per-market limit minus current market loan
  // 2. Aggregate limit minus total loan across all markets
  // 3. Daily limit minus today's loans
  const availableMarket = Math.max(0, maxLoan - currentLoan)
  const available = eligibility.eligible
    ? Math.min(availableMarket, availableAggregate, availableToday)
    : 0

  // Build per-answer loan breakdown for multi-choice markets
  const answerLoans = contractMetrics
    .filter(
      (m) =>
        m.answerId !== null &&
        ((m.loan ?? 0) > 0 || (m.marginLoan ?? 0) > 0 || (m.payout ?? 0) > 0)
    )
    .map((m) => ({
      answerId: m.answerId!,
      loan: (m.loan ?? 0) + (m.marginLoan ?? 0),
      freeLoan: m.loan ?? 0,
      marginLoan: m.marginLoan ?? 0,
      positionValue: m.payout ?? 0,
    }))

  return {
    maxLoan,
    currentLoan,
    currentFreeLoan,
    currentMarginLoan,
    available,
    netWorthLimit,
    positionLimit,
    totalPositionValue,
    eligible: eligibility.eligible,
    eligibilityReason: eligibility.reason,
    // Include aggregate info for transparency
    aggregateLimit: maxAggregateLoan,
    totalLoanAllMarkets,
    availableAggregate,
    // Include daily limit info
    dailyLimit,
    todayLoans,
    availableToday,
    // Per-answer loan breakdown for multi-choice markets
    answerLoans,
  }
}
