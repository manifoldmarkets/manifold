import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import {
  calculateMaxGeneralLoanAmount,
  calculateDailyLoanLimit,
  calculateMarketLoanMax,
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
import {
  getFreeLoanRate,
  getMaxLoanNetWorthPercent,
  SUPPORTER_ENTITLEMENT_IDS,
} from 'common/supporter-config'
import { convertEntitlement } from 'common/shop/types'

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
    [userId, [...SUPPORTER_ENTITLEMENT_IDS]]
  )
  const entitlements = supporterEntitlementRows.map(convertEntitlement)
  const maxLoanPercent = getMaxLoanNetWorthPercent(entitlements)
  const freeLoanRate = getFreeLoanRate(entitlements)

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

  // Calculate portfolio value (net of loans)
  const { value: portfolioValueNet } = getUnresolvedStatsForToken(
    'MANA',
    metrics,
    contractsById
  )

  // Calculate equity from net portfolio value (already excludes loans).
  // Using equity prevents the compounding loop where borrowing increases borrowing capacity.
  // Note: Balance is not included since loans are taken against positions.
  const equity = Math.max(0, portfolioValueNet)

  // Calculate limits based on equity (tier-specific max loan)
  const maxLoan = calculateMaxGeneralLoanAmount(equity, maxLoanPercent)
  const dailyLimit = calculateDailyLoanLimit(equity)

  // Get today's loans (since midnight PT)
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

  // Get today's free loan claim specifically (since midnight PT)
  const todaysFreeLoanResult = await pg.oneOrNone<{ total: number }>(
    `select coalesce(sum(amount), 0) as total
     from txns
     where to_id = $1
     and category = 'LOAN'
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

  // Group metrics by contractId for per-market limit calculations
  const metricsGroupedByContract: Record<string, typeof metrics> = {}
  for (const m of metrics) {
    if (!metricsGroupedByContract[m.contractId]) {
      metricsGroupedByContract[m.contractId] = []
    }
    metricsGroupedByContract[m.contractId].push(m)
  }

  // Calculate per-market/per-answer loan limits (same logic as claim-free-loan.ts)
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
        const maxLoan = calculateMarketLoanMax(equity)
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
      const maxLoan = calculateMarketLoanMax(equity)
      marketLoanInfo[contractId] = {
        currentLoan,
        positionValue,
        maxLoan,
        remainingCapacity: Math.max(0, maxLoan - currentLoan),
      }
    }
  }

  // Calculate free loan per position, capped by per-market/per-answer limits
  const positions = eligibleMetrics.map((m) => {
    const baseFreeLoan = calculatePositionFreeLoan(
      m.payout ?? 0,
      m.invested ?? 0,
      freeLoanRate
    )

    const contract = contractsById[m.contractId]
    const isIndependent =
      contract?.mechanism === 'cpmm-multi-1' && !contract?.shouldAnswersSumToOne

    let freeLoanContribution = baseFreeLoan

    if (isIndependent) {
      // For independent markets, use per-answer limit
      const key = `${m.contractId}-${m.answerId ?? ''}`
      const info = answerLoanInfo[key]
      if (info) {
        freeLoanContribution = Math.min(baseFreeLoan, info.remainingCapacity)
        // Reduce remaining capacity for this answer
        info.remainingCapacity = Math.max(
          0,
          info.remainingCapacity - freeLoanContribution
        )
      }
    } else {
      // For sums-to-one markets, use per-market limit (shared capacity)
      const info = marketLoanInfo[m.contractId]
      if (info) {
        freeLoanContribution = Math.min(baseFreeLoan, info.remainingCapacity)
        // Reduce remaining capacity for this market
        info.remainingCapacity = Math.max(
          0,
          info.remainingCapacity - freeLoanContribution
        )
      }
    }

    return {
      contractId: m.contractId,
      answerId: m.answerId,
      payout: m.payout ?? 0,
      invested: m.invested ?? 0,
      freeLoanContribution,
    }
  })

  // Sum up current loans
  const currentFreeLoan = sumBy(metrics, (m) => m.loan ?? 0)
  const currentMarginLoan = sumBy(metrics, (m) => m.marginLoan ?? 0)
  const totalLoan = currentFreeLoan + currentMarginLoan

  // Calculate total free loan available (with per-market limits already applied)
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
