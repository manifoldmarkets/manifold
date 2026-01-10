import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, getContract } from 'shared/utils'
import {
  calculateMarketLoanMax,
  calculateMaxGeneralLoanAmount,
  MAX_MARKET_LOAN_NET_WORTH_PERCENT,
  MAX_MARKET_LOAN_POSITION_PERCENT,
  MAX_LOAN_NET_WORTH_PERCENT,
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
  const { contractId } = props
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

  // Sum loans across ALL answers for this contract (per-market limit)
  const contractMetrics = metrics.filter((m) => m.contractId === contractId)
  const currentLoan = sumBy(contractMetrics, (m) => m.loan ?? 0)
  const totalPositionValue = sumBy(contractMetrics, (m) => m.payout ?? 0)

  // Calculate per-market limits
  const netWorthLimit = netWorth * MAX_MARKET_LOAN_NET_WORTH_PERCENT
  const positionLimit = totalPositionValue * MAX_MARKET_LOAN_POSITION_PERCENT
  const maxLoan = calculateMarketLoanMax(netWorth, totalPositionValue)

  // Calculate aggregate limit (80% of net worth total across ALL markets)
  const maxAggregateLoan = calculateMaxGeneralLoanAmount(netWorth)
  const availableAggregate = Math.max(0, maxAggregateLoan - totalLoanAllMarkets)

  // Available is the minimum of:
  // 1. Per-market limit minus current market loan
  // 2. Aggregate limit minus total loan across all markets
  const availableMarket = Math.max(0, maxLoan - currentLoan)
  const available = eligibility.eligible
    ? Math.min(availableMarket, availableAggregate)
    : 0

  return {
    maxLoan,
    currentLoan,
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
  }
}
