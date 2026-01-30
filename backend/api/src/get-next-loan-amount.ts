import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import {
  calculateMaxGeneralLoanAmount,
  calculateDailyLoanLimit,
  canClaimDailyFreeLoan,
  calculateTotalFreeLoanAvailable,
  isMarketEligibleForLoan,
  getMidnightPacific,
  calculateEquity,
} from 'common/loans'
import {
  canAccessMarginLoans,
  getFreeLoanRate,
  getMaxLoanNetWorthPercent,
  SUPPORTER_ENTITLEMENT_IDS,
} from 'common/supporter-config'
import { convertEntitlement } from 'common/shop/types'
import {
  getUnresolvedContractMetricsContractsAnswers,
  getUnresolvedStatsForToken,
} from 'shared/update-user-portfolio-histories-core'
import { keyBy, sumBy } from 'lodash'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'

export const getNextLoanAmount: APIHandler<'get-next-loan-amount'> = async ({
  userId,
}) => {
  const pg = createSupabaseDirectClient()

  const portfolioMetric = await pg.oneOrNone(
    `select *
     from user_portfolio_history_latest
     where user_id = $1`,
    [userId],
    convertPortfolioHistory
  )
  if (!portfolioMetric) {
    return {
      maxGeneralLoan: 0,
      currentLoan: 0,
      available: 0,
      dailyLimit: 0,
      todayLoans: 0,
      availableToday: 0,
    }
  }

  const user = await getUser(userId)
  if (!user) {
    return {
      maxGeneralLoan: 0,
      currentLoan: 0,
      available: 0,
      dailyLimit: 0,
      todayLoans: 0,
      availableToday: 0,
    }
  }

  // Fetch supporter entitlements for tier-specific benefits
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
    [userId, [...SUPPORTER_ENTITLEMENT_IDS]]
  )
  const entitlements = supporterEntitlementRows.map(convertEntitlement)
  const hasMarginLoanAccess = canAccessMarginLoans(entitlements)
  const maxLoanPercent = getMaxLoanNetWorthPercent(entitlements)
  const freeLoanRate = getFreeLoanRate(entitlements)

  const { metrics, contracts } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [userId])
  const contractsById = keyBy(contracts, 'id')
  const { value: portfolioValueNet } = getUnresolvedStatsForToken(
    'MANA',
    metrics,
    contractsById
  )

  // Total loan includes both free loans and margin loans
  const currentFreeLoan = sumBy(metrics, (m) => m.loan ?? 0)
  const currentMarginLoan = sumBy(metrics, (m) => m.marginLoan ?? 0)
  const currentLoan = currentFreeLoan + currentMarginLoan
  // getUnresolvedStatsForToken returns value net of loans; add them back for gross value.
  const portfolioValue = portfolioValueNet + currentLoan

  // Calculate equity (portfolio value minus outstanding loans)
  // Using equity prevents the compounding loop where borrowing increases borrowing capacity
  // Note: Balance is not included since loans are taken against positions
  const equity = calculateEquity(portfolioValue, currentLoan)

  // Calculate limits based on equity
  const maxGeneralLoan = calculateMaxGeneralLoanAmount(equity, maxLoanPercent)
  const available = Math.max(0, maxGeneralLoan - currentLoan)

  // Calculate daily limit based on equity (resets at midnight PT)
  const dailyLimit = calculateDailyLoanLimit(equity)
  const midnightPT = getMidnightPacific()
  const todayLoansResult = await pg.oneOrNone<{ total: number }>(
    `select coalesce(sum(amount), 0) as total
     from txns
     where to_id = $1
     and category IN ('MARGIN_LOAN', 'LOAN')
     and created_time >= $2`,
    [userId, midnightPT.toISOString()]
  )
  const todayLoans = todayLoansResult?.total ?? 0
  const availableToday = Math.max(0, dailyLimit - todayLoans)

  // Get last free loan claim time
  const lastClaimResult = await pg.oneOrNone<{ last_free_loan_claim: Date }>(
    `SELECT last_free_loan_claim FROM users WHERE id = $1`,
    [userId]
  )
  const lastClaimTime = lastClaimResult?.last_free_loan_claim ?? null
  const canClaimFreeLoan = canClaimDailyFreeLoan(lastClaimTime)

  // Calculate free loan available
  const eligibleMetrics = metrics.filter((m) => {
    const contract = contractsById[m.contractId]
    if (!contract) return false
    if (contract.token !== 'MANA') return false
    if (contract.isResolved) return false
    if ((m.payout ?? 0) <= 0 && (m.invested ?? 0) <= 0) return false
    return isMarketEligibleForLoan({
      visibility: contract.visibility,
      isRanked: contract.isRanked,
      uniqueBettorCount: contract.uniqueBettorCount ?? 0,
      createdTime: contract.createdTime,
    }).eligible
  })

  const freeLoanAvailable = canClaimFreeLoan
    ? Math.min(
        calculateTotalFreeLoanAvailable(
          eligibleMetrics.map((m) => ({
            payout: m.payout ?? 0,
            invested: m.invested ?? 0,
          })),
          freeLoanRate
        ),
        available,
        availableToday
      )
    : 0

  return {
    maxGeneralLoan,
    currentLoan,
    available,
    dailyLimit,
    todayLoans,
    availableToday,
    // New fields for free/margin loan breakdown
    currentFreeLoan,
    currentMarginLoan,
    freeLoanAvailable,
    canClaimFreeLoan: canClaimFreeLoan && freeLoanAvailable >= 1,
    hasMarginLoanAccess,
    // Equity-based calculation fields (equity = portfolioValue - loans)
    equity,
    portfolioValue,
  }
}
