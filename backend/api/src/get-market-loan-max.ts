import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, getContract } from 'shared/utils'
import {
  calculateMarketLoanMax,
  calculateMaxGeneralLoanAmount,
  calculateDailyLoanLimit,
  MAX_MARKET_LOAN_NET_WORTH_PERCENT,
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
import {
  getMaxLoanNetWorthPercent,
  SUPPORTER_ENTITLEMENT_IDS,
} from 'common/supporter-config'
import { convertEntitlement } from 'common/shop/types'

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

  // Fetch supporter entitlements for tier-specific max loan
  const supporterEntitlementRows = await pg.manyOrNone<{
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
    [auth.uid, [...SUPPORTER_ENTITLEMENT_IDS]]
  )
  const entitlements = supporterEntitlementRows.map(convertEntitlement)
  const maxLoanPercent = getMaxLoanNetWorthPercent(entitlements)

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

  // Get user's metrics for this contract and calculate portfolio value
  const { metrics, contracts } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [user.id])
  const contractsById = keyBy(contracts, 'id')
  const { value: portfolioValueNet } = getUnresolvedStatsForToken(
    'MANA',
    metrics,
    contractsById
  )

  // Calculate equity from net portfolio value (already excludes loans).
  // Using equity prevents the compounding loop where borrowing increases borrowing capacity.
  // Note: Balance is not included since loans are taken against positions.
  const equity = Math.max(0, portfolioValueNet)

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

  // Calculate per-market limit based on equity (5% of equity)
  const equityLimit = equity * MAX_MARKET_LOAN_NET_WORTH_PERCENT
  const maxLoan = calculateMarketLoanMax(equity)

  // Calculate aggregate limit based on equity (tier-specific % of equity total across ALL markets)
  const maxAggregateLoan = calculateMaxGeneralLoanAmount(equity, maxLoanPercent)
  const availableAggregate = Math.max(0, maxAggregateLoan - totalLoanAllMarkets)

  // Calculate daily limit based on equity (10% of equity per day)
  const dailyLimit = calculateDailyLoanLimit(equity)
  const oneDayAgo = Date.now() - MS_PER_DAY
  const todayLoansResult = await pg.oneOrNone<{ total: number }>(
    `select coalesce(sum(amount), 0) as total
     from txns
     where to_id = $1
     and category = 'MARGIN_LOAN'
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
    equityLimit,
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
