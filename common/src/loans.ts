import { sumBy } from 'lodash'
import { PortfolioMetrics } from './portfolio-metrics'
import { ContractMetric } from './contract-metric'
import { Contract, ContractToken, isMultiCpmm } from './contract'
import { calculatePayoutFromShares } from './calculate-metrics'
import { filterDefined } from './util/array'

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

/**
 * Calculate equity (portfolio value minus outstanding loans).
 * Equity represents the user's true ownership stake in positions and is used for loan limit calculations.
 * This breaks the feedback loop where borrowing more would increase borrowing capacity.
 * Note: Balance is not included since loans are taken against positions, not balance.
 */
export const calculateEquity = (
  portfolioValue: number,
  loanTotal: number
): number => {
  return Math.max(0, portfolioValue - loanTotal)
}

/**
 * Metrics that count as collateral for loan limits. Perp positions are
 * excluded: they are internally leveraged, can be liquidated to zero before
 * any loan is recovered, and never carry loans themselves — so counting their
 * oracle-marked value in equity would let users re-leverage perp exposure
 * into borrowing capacity against unrelated positions.
 */
export const filterLoanEquityMetrics = <M extends { contractId: string }>(
  metrics: M[],
  contractsById: Record<string, Pick<Contract, 'mechanism'> | undefined>
): M[] => {
  return metrics.filter(
    (m) => contractsById[m.contractId]?.mechanism !== 'perp'
  )
}

/**
 * The position value that `filterLoanEquityMetrics` removes from the equity
 * base, for the given token. Purely informational: the loan endpoints return
 * it so the UI can explain why the portfolio value it shows is lower than the
 * one shown everywhere else on the site.
 */
export const sumExcludedPerpEquity = (
  metrics: { contractId: string; payout?: number }[],
  contractsById: Record<
    string,
    Pick<Contract, 'mechanism' | 'token'> | undefined
  >,
  token: ContractToken = 'MANA'
): number => {
  const total = sumBy(metrics, (m) => {
    const contract = contractsById[m.contractId]
    if (contract?.mechanism !== 'perp' || contract.token !== token) return 0
    const payout = m.payout ?? 0
    return Number.isFinite(payout) ? payout : 0
  })
  return Math.max(0, total)
}

/**
 * Whether a user's bonusEligibility state permits taking loans (daily free
 * loans, and margin loans subject to their subscription entitlements).
 *
 * Loans are borrowed against the user's own positions rather than granted, so
 * never-verified users (bonusEligibility undefined) can take them — the same
 * accounts hasFullBonusAccess admits, but kept as its own predicate so this
 * module needs no User import and borrowing can diverge from bonuses later.
 *
 * Both explicit deny states stay denied, because bonusEligibility is overloaded
 * and they are the field's only load-bearing authorization signals:
 *
 *   'requires_verification' — admin/system flag for suspected alts and accounts
 *       under manual review; frozen pending that review.
 *   'ineligible' — superBanUserCore writes it alongside permanent bans, and
 *       older rows came from failed/expired iDenfy sessions (the callback no
 *       longer touches bonusEligibility on denial, so a flagged account can't
 *       launder its hold by letting a session expire). Allowing it would
 *       restore borrowing to superbanned users.
 *
 * This predicate is necessary but not sufficient: bonusEligibility is not a ban
 * record, so callers must ALSO check user_bans independently (see
 * claim-free-loan). Don't let this function grow into the ban check.
 *
 * Takes just the one field it reads, so this module needs no User import.
 */
export const canTakeLoans = (user: {
  bonusEligibility?: string | undefined
}): boolean =>
  user.bonusEligibility !== 'requires_verification' &&
  user.bonusEligibility !== 'ineligible'

export const isUserEligibleForLoan = (portfolio: PortfolioMetrics) => {
  const { investmentValue, loanTotal } = portfolio
  return investmentValue > 0 && !overLeveraged(loanTotal ?? 0, investmentValue)
}

/**
 * Check if user is eligible for a general loan based on equity.
 * Using equity instead of net worth prevents the feedback loop.
 */
export const isUserEligibleForGeneralLoan = (
  portfolio: PortfolioMetrics,
  equity: number,
  requestedAmount: number,
  maxLoanPercent: number = MAX_LOAN_NET_WORTH_PERCENT
): boolean => {
  const { loanTotal } = portfolio
  if (equity <= 0) return false

  const maxLoan = calculateMaxGeneralLoanAmount(equity, maxLoanPercent)
  const currentLoan = loanTotal ?? 0
  return currentLoan + requestedAmount <= maxLoan
}

/**
 * Check if user is eligible for a loan on a specific market based on equity.
 * Using equity ensures per-market limits don't inflate with outstanding loans.
 */
export const isUserEligibleForMarketLoan = (
  currentMarketLoan: number,
  requestedAmount: number,
  equity: number
): boolean => {
  const maxLoan = calculateMarketLoanMax(equity)
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

/**
 * Calculate the maximum general loan amount based on equity.
 * Using equity (net worth minus loans) instead of net worth prevents
 * the compounding loop where borrowing increases borrowing capacity.
 */
export const calculateMaxGeneralLoanAmount = (
  equity: number,
  maxLoanPercent: number = MAX_LOAN_NET_WORTH_PERCENT
): number => {
  return equity * maxLoanPercent
}

/**
 * Calculate the daily loan limit based on equity.
 * Using equity ensures borrowing doesn't inflate the daily limit.
 */
export const calculateDailyLoanLimit = (equity: number): number => {
  return equity * DAILY_LOAN_NET_WORTH_PERCENT
}

/**
 * Calculate the maximum loan per market based on equity.
 * Using equity prevents per-market limits from growing with outstanding loans.
 */
export const calculateMarketLoanMax = (equity: number): number => {
  return equity * MAX_MARKET_LOAN_NET_WORTH_PERCENT
}

export type LoanDistribution = {
  contractId: string
  answerId: string | null
  loanAmount: number
}

/**
 * The most a position may owe (free + margin loan), as a share of its current
 * value, for it to take more margin loan.
 *
 * A user at their tier's total limit owes maxLoanPercent × equity, which is
 * maxLoanPercent / (1 + maxLoanPercent) of their portfolio's value. Capping
 * each position at that same ratio (100% → 50%, 200% → 67%, 300% → 75%) puts
 * the cap where the tier's leverage already says it is, and keeps it under
 * 100%: right after a margin loan, selling a position that took some of it
 * at its current value repays its loan with room to spare for slippage.
 * Later price moves can still push a position's loan past its value.
 */
export const getMaxPositionLoanToValue = (maxLoanPercent: number): number =>
  Number.isFinite(maxLoanPercent) && maxLoanPercent > 0
    ? maxLoanPercent / (1 + maxLoanPercent)
    : 0

export type MarginLoanPosition = {
  contractId: string
  answerId: string | null
  // What the shares are worth at the current probability.
  value: number
  // Free + margin loan already on the position.
  loan: number
}

/**
 * The positions a new margin loan can go on, valued at the current
 * probability: unresolved, ranked, listed MANA markets (and answers) with
 * enough traders and age (isMarketEligibleForLoan). Perps never take loans.
 * Positions are per answer on multiple choice markets, because a sale repays
 * only the sold answer's loan.
 */
export const getMarginLoanPositions = (
  metrics: ContractMetric[],
  contractsById: Record<string, Contract | undefined>
): MarginLoanPosition[] =>
  filterDefined(
    metrics.map((m) => {
      const contract = contractsById[m.contractId]
      if (!contract || contract.isResolved || contract.token !== 'MANA') {
        return undefined
      }
      if (
        !isMarketEligibleForLoan({
          visibility: contract.visibility,
          isRanked: contract.isRanked,
          uniqueBettorCount: contract.uniqueBettorCount ?? 0,
          createdTime: contract.createdTime,
        }).eligible
      ) {
        return undefined
      }

      let prob: number | undefined
      if (isMultiCpmm(contract)) {
        // Summary rows (no answerId) duplicate the answer rows.
        const answer = m.answerId
          ? contract.answers?.find((a) => a.id === m.answerId)
          : undefined
        if (!answer || answer.resolution || answer.resolutionTime) {
          return undefined
        }
        prob = answer.prob
      } else if (contract.mechanism === 'cpmm-1') {
        prob = contract.prob
      }
      if (prob === undefined) return undefined

      return {
        contractId: m.contractId,
        answerId: m.answerId,
        value: calculatePayoutFromShares(m.totalShares ?? {}, prob),
        loan: (m.loan ?? 0) + (m.marginLoan ?? 0),
      }
    })
  )

/**
 * How much more loan a position can take before it owes maxLoanToValue of its
 * value. Zero for anything that isn't a finite, positive value with a finite
 * loan, so bad data never makes room.
 */
export const getPositionLoanRoom = (
  position: Pick<MarginLoanPosition, 'value' | 'loan'>,
  maxLoanToValue: number
): number => {
  const { value, loan } = position
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(loan) ||
    !Number.isFinite(maxLoanToValue) ||
    value <= 0 ||
    maxLoanToValue <= 0
  ) {
    return 0
  }
  // Never let a position owe more than it's worth, whatever ratio is passed.
  const cap = value * Math.min(1, maxLoanToValue)
  return Math.max(0, cap - Math.max(0, loan))
}

/** The most margin loan the positions can take, summed over their room. */
export const getMarginLoanCapacity = (
  positions: MarginLoanPosition[],
  maxLoanToValue: number
): number => sumBy(positions, (p) => getPositionLoanRoom(p, maxLoanToValue))

/**
 * Spreads a margin loan over the positions in proportion to their room, so
 * every position uses up the same share of its room and none passes its cap.
 * Positions already at their cap take nothing.
 *
 * Distributes at most the positions' capacity: callers must reject (or cut)
 * a request larger than getMarginLoanCapacity, since the shortfall goes
 * nowhere.
 */
export const distributeMarginLoan = (
  loanAmount: number,
  positions: MarginLoanPosition[],
  maxLoanToValue: number
): LoanDistribution[] => {
  if (!Number.isFinite(loanAmount) || loanAmount <= 0) return []

  const withRoom = positions
    .map((position) => ({
      position,
      room: getPositionLoanRoom(position, maxLoanToValue),
    }))
    .filter((p) => p.room > 0)
  const capacity = sumBy(withRoom, (p) => p.room)
  if (!(capacity > 0)) return []

  // fill <= 1, so room * fill <= room even after rounding.
  const fill = Math.min(1, loanAmount / capacity)
  return withRoom
    .map(({ position, room }) => ({
      contractId: position.contractId,
      answerId: position.answerId,
      loanAmount: room * fill,
    }))
    .filter((d) => d.loanAmount > 0)
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
