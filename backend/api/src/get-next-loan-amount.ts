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
} from 'common/loans'
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

  const { metrics, contracts } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [userId])
  const contractsById = keyBy(contracts, 'id')
  const { value } = getUnresolvedStatsForToken('MANA', metrics, contractsById)
  const netWorth = user.balance + value

  const maxGeneralLoan = calculateMaxGeneralLoanAmount(netWorth)
  // Total loan includes both free loans and margin loans
  const currentFreeLoan = sumBy(metrics, (m) => m.loan ?? 0)
  const currentMarginLoan = sumBy(metrics, (m) => m.marginLoan ?? 0)
  const currentLoan = currentFreeLoan + currentMarginLoan
  const available = Math.max(0, maxGeneralLoan - currentLoan)

  // Calculate daily limit and today's loans (resets at midnight PT)
  const dailyLimit = calculateDailyLoanLimit(netWorth)
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
          }))
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
  }
}
