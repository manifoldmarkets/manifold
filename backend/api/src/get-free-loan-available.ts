import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import {
  calculateMaxGeneralLoanAmount,
  calculateDailyLoanLimit,
  calculatePositionFreeLoan,
  canClaimDailyFreeLoan,
  isMarketEligibleForLoan,
  getMidnightPacific,
} from 'common/loans'
import {
  getUnresolvedContractMetricsContractsAnswers,
  getUnresolvedStatsForToken,
} from 'shared/update-user-portfolio-histories-core'
import { keyBy, sumBy } from 'lodash'

export const getFreeLoanAvailable: APIHandler<
  'get-free-loan-available'
> = async (_, auth) => {
  const pg = createSupabaseDirectClient()
  const userId = auth.uid

  // Get user info including last free loan claim time
  const user = await getUser(userId)
  if (!user) {
    return {
      available: 0,
      canClaim: false,
      lastClaimTime: null,
      positions: [],
      currentFreeLoan: 0,
      currentMarginLoan: 0,
      totalLoan: 0,
      maxLoan: 0,
      dailyLimit: 0,
      todayLoans: 0,
      todaysFreeLoan: 0,
    }
  }

  // Get last claim time from users table
  const lastClaimResult = await pg.oneOrNone<{ last_free_loan_claim: Date }>(
    `SELECT last_free_loan_claim FROM users WHERE id = $1`,
    [userId]
  )
  const lastClaimTime = lastClaimResult?.last_free_loan_claim ?? null

  // Check if user can claim today (hasn't claimed since midnight PT)
  const canClaim = canClaimDailyFreeLoan(lastClaimTime)

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

  // Get today's free loan claim specifically (since midnight PT)
  const todaysFreeLoanResult = await pg.oneOrNone<{ total: number }>(
    `select coalesce(sum(amount), 0) as total
     from txns
     where to_id = $1
     and category = 'DAILY_FREE_LOAN'
     and created_time >= $2`,
    [userId, midnightPT.toISOString()]
  )
  const todaysFreeLoan = todaysFreeLoanResult?.total ?? 0

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

  // Calculate free loan contribution per position
  const positions = eligibleMetrics.map((m) => ({
    contractId: m.contractId,
    answerId: m.answerId,
    payout: m.payout ?? 0,
    invested: m.invested ?? 0,
    freeLoanContribution: calculatePositionFreeLoan(
      m.payout ?? 0,
      m.invested ?? 0
    ),
  }))

  // Sum up current loans
  const currentFreeLoan = sumBy(metrics, (m) => m.loan ?? 0)
  const currentMarginLoan = sumBy(metrics, (m) => m.marginLoan ?? 0)
  const totalLoan = currentFreeLoan + currentMarginLoan

  // Calculate total free loan available (before applying limits)
  const totalFreeLoanAvailable = sumBy(positions, (p) => p.freeLoanContribution)

  // Apply limits
  const availableUnderCap = Math.max(0, maxLoan - totalLoan)
  const availableToday = Math.max(0, dailyLimit - todayLoans)
  const available = canClaim
    ? Math.min(totalFreeLoanAvailable, availableUnderCap, availableToday)
    : 0

  return {
    available,
    canClaim: canClaim && available >= 1, // Only show as claimable if >= 1 mana
    lastClaimTime: lastClaimTime ? new Date(lastClaimTime).getTime() : null,
    positions,
    currentFreeLoan,
    currentMarginLoan,
    totalLoan,
    maxLoan,
    dailyLimit,
    todayLoans,
    todaysFreeLoan,
  }
}
