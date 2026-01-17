import { sumBy } from 'lodash'
import { PortfolioMetrics } from './portfolio-metrics'
import { ContractMetric } from './contract-metric'

export type LoanTrackingRow = {
  id?: number
  user_id: string
  contract_id: string
  answer_id: string | null
  loan_day_integral: number
  last_loan_update_time: number
}

export const MAX_LOAN_NET_WORTH_PERCENT = 1.0 // 100% max total for all loans (free + margin)
export const DAILY_LOAN_NET_WORTH_PERCENT = 0.1 // 10% max per day for general loans
export const MAX_MARKET_LOAN_NET_WORTH_PERCENT = 0.05 // 5% of net worth per market
export const LOAN_DAILY_INTEREST_RATE = 0.0003 // 0.03% per day (margin loans only)
export const FREE_LOAN_POSITION_PERCENT = 0.01 // 1% of position value for daily free loan
export const MS_PER_DAY = 24 * 60 * 60 * 1000
export const MIN_TRADERS_FOR_MARKET_LOAN = 10
export const MIN_AGE_HOURS_FOR_MARKET_LOAN = 24

// Pacific timezone offset handling for daily free loan reset
export const PACIFIC_TIMEZONE = 'America/Los_Angeles'

/**
 * Get midnight Pacific Time for today or a given date.
 * Returns a Date representing 00:00:00 Pacific Time on the given date.
 */
export const getMidnightPacific = (date: Date = new Date()): Date => {
  // Get the date string in Pacific timezone (YYYY-MM-DD format)
  const pacificDateStr = date.toLocaleDateString('en-CA', {
    timeZone: PACIFIC_TIMEZONE,
  })

  // Parse it back as a date and get the Pacific timezone offset at that time
  // We need to find what UTC time corresponds to midnight Pacific
  const [year, month, day] = pacificDateStr.split('-').map(Number)

  // Create a date at noon UTC on that day (to avoid DST edge cases)
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))

  // Get the Pacific time string at noon UTC
  const pacificTimeAtNoon = noonUtc.toLocaleString('en-US', {
    timeZone: PACIFIC_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  })
  const pacificHourAtNoon = parseInt(pacificTimeAtNoon, 10)

  // The offset in hours from UTC is (12 - pacificHourAtNoon)
  // So midnight Pacific = midnight UTC + offset hours
  const offsetHours = 12 - pacificHourAtNoon
  return new Date(Date.UTC(year, month - 1, day, offsetHours, 0, 0))
}

/**
 * Check if user can claim daily free loan (hasn't claimed since midnight PT today).
 */
export const canClaimDailyFreeLoan = (
  lastClaimTime: Date | null | undefined
): boolean => {
  if (!lastClaimTime) return true
  const midnightPT = getMidnightPacific()
  return new Date(lastClaimTime) < midnightPT
}

/**
 * Calculate free loan available for a single position.
 * Free loan = min(X% of payout value, cost basis/invested amount)
 * Rate is tier-based: Free/Plus=1%, Pro=2%, Premium=3%
 */
export const calculatePositionFreeLoan = (
  positionPayout: number,
  invested: number,
  freeLoanRate: number = FREE_LOAN_POSITION_PERCENT
): number => {
  if (positionPayout <= 0 || invested <= 0) return 0
  return Math.min(positionPayout * freeLoanRate, invested)
}

/**
 * Calculate total free loan available across all eligible positions.
 */
export const calculateTotalFreeLoanAvailable = (
  metrics: Array<{ payout: number; invested: number }>,
  freeLoanRate: number = FREE_LOAN_POSITION_PERCENT
): number => {
  return sumBy(metrics, (m) =>
    calculatePositionFreeLoan(m.payout, m.invested, freeLoanRate)
  )
}

export type MarketLoanEligibility = {
  eligible: boolean
  reason?: string
}

/**
 * Check if a market is eligible for new loans.
 * Criteria:
 * - Market must be listed (visibility = 'public')
 * - Market must be ranked (isRanked != false)
 * - Market must have > 10 traders
 * - Market must have existed for 24+ hours
 */
export const isMarketEligibleForLoan = (market: {
  visibility: string
  isRanked?: boolean
  uniqueBettorCount: number
  createdTime: number
}): MarketLoanEligibility => {
  const now = Date.now()
  const ageHours = (now - market.createdTime) / (1000 * 60 * 60)

  if (market.visibility !== 'public') {
    return { eligible: false, reason: 'Market must be listed (public)' }
  }

  if (market.isRanked === false) {
    return { eligible: false, reason: 'Market must be ranked' }
  }

  if (market.uniqueBettorCount <= MIN_TRADERS_FOR_MARKET_LOAN) {
    return {
      eligible: false,
      reason: `Market must have more than ${MIN_TRADERS_FOR_MARKET_LOAN} traders`,
    }
  }

  if (ageHours < MIN_AGE_HOURS_FOR_MARKET_LOAN) {
    return {
      eligible: false,
      reason: `Market must be at least ${MIN_AGE_HOURS_FOR_MARKET_LOAN} hours old`,
    }
  }

  return { eligible: true }
}

export const overLeveraged = (loanTotal: number, investmentValue: number) =>
  loanTotal / investmentValue >= 8

export const isUserEligibleForLoan = (portfolio: PortfolioMetrics) => {
  const { investmentValue, loanTotal } = portfolio
  return investmentValue > 0 && !overLeveraged(loanTotal ?? 0, investmentValue)
}

export const isUserEligibleForGeneralLoan = (
  portfolio: PortfolioMetrics,
  netWorth: number,
  requestedAmount: number
): boolean => {
  const { loanTotal } = portfolio
  if (netWorth <= 0) return false

  const maxLoan = calculateMaxGeneralLoanAmount(netWorth)
  const currentLoan = loanTotal ?? 0
  return currentLoan + requestedAmount <= maxLoan
}

export const isUserEligibleForMarketLoan = (
  currentMarketLoan: number,
  requestedAmount: number,
  netWorth: number
): boolean => {
  const maxLoan = calculateMarketLoanMax(netWorth)
  return currentMarketLoan + requestedAmount <= maxLoan
}

export type LoanWithInterest = {
  contractId: string
  answerId: string | null
  principal: number
  interest: number
  total: number
  lastUpdateTime: number
}

/**
 * Calculate margin loan with accrued interest.
 * Only margin loans (marginLoan field) accrue interest.
 * Free loans (loan field) are interest-free forever.
 */
export const calculateLoanWithInterest = (
  metric: ContractMetric,
  tracking: LoanTrackingRow | undefined,
  now: number = Date.now()
): LoanWithInterest => {
  // Only margin loans accrue interest
  const principal = metric.marginLoan ?? 0
  if (principal === 0) {
    return {
      contractId: metric.contractId,
      answerId: metric.answerId,
      principal: 0,
      interest: 0,
      total: 0,
      lastUpdateTime: now,
    }
  }

  if (!tracking) {
    // Margin loan without tracking - treat as no interest yet
    return {
      contractId: metric.contractId,
      answerId: metric.answerId,
      principal,
      interest: 0,
      total: principal,
      lastUpdateTime: now,
    }
  }

  const daysSinceLastUpdate =
    (now - tracking.last_loan_update_time) / MS_PER_DAY
  const finalIntegral =
    tracking.loan_day_integral + principal * daysSinceLastUpdate
  const interest = finalIntegral * LOAN_DAILY_INTEREST_RATE

  return {
    contractId: metric.contractId,
    answerId: metric.answerId,
    principal,
    interest,
    total: principal + interest,
    lastUpdateTime: tracking.last_loan_update_time,
  }
}

/**
 * Get total loan amount (free + margin) for a metric.
 */
export const getTotalLoan = (metric: ContractMetric): number => {
  return (metric.loan ?? 0) + (metric.marginLoan ?? 0)
}

export type RepaymentDistribution = {
  contractId: string
  answerId: string | null
  amountRepaid: number
  principalRepaid: number
  interestRepaid: number
}

export const calculateMaxGeneralLoanAmount = (netWorth: number): number => {
  return netWorth * MAX_LOAN_NET_WORTH_PERCENT
}

export const calculateDailyLoanLimit = (netWorth: number): number => {
  return netWorth * DAILY_LOAN_NET_WORTH_PERCENT
}

export const calculateMarketLoanMax = (netWorth: number): number => {
  return netWorth * MAX_MARKET_LOAN_NET_WORTH_PERCENT
}

export type LoanDistribution = {
  contractId: string
  answerId: string | null
  loanAmount: number
}

export const distributeLoanProportionally = (
  loanAmount: number,
  metrics: ContractMetric[]
): LoanDistribution[] => {
  // Filter to only unresolved MANA markets with investment
  const metricsWithInvestment = metrics.filter((m) => (m.invested ?? 0) > 0)

  if (metricsWithInvestment.length === 0) {
    return []
  }

  // Calculate total investment
  const totalInvestment = sumBy(metricsWithInvestment, (m) => m.invested ?? 0)

  if (totalInvestment <= 0) {
    return []
  }

  // Distribute proportionally
  const distributions: LoanDistribution[] = []
  for (const metric of metricsWithInvestment) {
    const investment = metric.invested ?? 0
    const proportion = investment / totalInvestment
    const loanForMarket = loanAmount * proportion

    if (loanForMarket > 0) {
      distributions.push({
        contractId: metric.contractId,
        answerId: metric.answerId,
        loanAmount: loanForMarket,
      })
    }
  }

  return distributions
}

export const distributeRepaymentProportionally = (
  repaymentAmount: number,
  loans: LoanWithInterest[]
): RepaymentDistribution[] => {
  // Filter to loans with positive total
  const activeLoans = loans.filter((loan) => loan.total > 0)

  if (activeLoans.length === 0) {
    return []
  }

  // Calculate total loan amount
  const totalLoan = sumBy(activeLoans, (loan) => loan.total)

  if (totalLoan <= 0) {
    return []
  }

  // Distribute proportionally
  const distributions: RepaymentDistribution[] = []
  for (const loan of activeLoans) {
    const proportion = loan.total / totalLoan
    const amountToRepay = repaymentAmount * proportion
    const principalRatio = loan.principal / loan.total
    const interestRatio = loan.interest / loan.total

    distributions.push({
      contractId: loan.contractId,
      answerId: loan.answerId,
      amountRepaid: amountToRepay,
      principalRepaid: amountToRepay * principalRatio,
      interestRepaid: amountToRepay * interestRatio,
    })
  }

  return distributions
}
