import { Dictionary, sumBy, first } from 'lodash'
import { MarketContract } from './contract'
import { PortfolioMetrics } from './portfolio-metrics'
import { ContractMetric, isSummary } from './contract-metric'
import { filterDefined } from './util/array'

export type LoanTrackingRow = {
  id?: number
  user_id: string
  contract_id: string
  answer_id: string | null
  loan_day_integral: number
  last_loan_update_time: number
}

export const LOAN_DAILY_RATE = 0.02 // Deprecated - no longer used for automatic loans
export const MAX_LOAN_NET_WORTH_PERCENT = 0.8 // 80% max total for general loans
export const DAILY_LOAN_NET_WORTH_PERCENT = 0.1 // 10% max per day for general loans
export const MAX_MARKET_LOAN_NET_WORTH_PERCENT = 0.05 // 5% of net worth per market
export const LOAN_DAILY_INTEREST_RATE = 0.0005 // 0.05% per day
export const MS_PER_DAY = 24 * 60 * 60 * 1000

// Market liquidity thresholds
const MIN_MARKET_AGE_DAYS = 7
const MIN_UNIQUE_TRADERS = 10
const MIN_VOLUME = 1000

const calculateNewLoan = (investedValue: number, loanTotal: number) => {
  const netValue = investedValue - loanTotal
  return netValue * LOAN_DAILY_RATE
}

export const getUserLoanUpdates = (
  metricsByContractId: Dictionary<Omit<ContractMetric, 'id'>[]>,
  contractsById: Dictionary<MarketContract>,
  netWorth: number
) => {
  const updates = calculateLoanMetricUpdates(
    metricsByContractId,
    contractsById,
    netWorth
  )
  return { updates, payout: sumBy(updates, (update) => update.newLoan) }
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
  const { investmentValue, loanTotal } = portfolio
  if (investmentValue <= 0) return false

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

const calculateLoanMetricUpdates = (
  metricsByContractId: Dictionary<Omit<ContractMetric, 'id'>[]>,
  contractsById: Dictionary<MarketContract>,
  netWorth: number
) => {
  return filterDefined(
    Object.entries(metricsByContractId).flatMap(([contractId, metrics]) => {
      const c = contractsById[contractId]
      if (!c || c.isResolved || c.token !== 'MANA') return undefined
      if (!metrics) {
        console.error(`No metrics found for contract ${contractId}`)
        return undefined
      }
      if (c.mechanism === 'cpmm-multi-1') {
        return metrics
          .filter(
            (m) =>
              !isSummary(m) &&
              !c.answers.find((a) => a.id === m.answerId)?.resolutionTime
          )
          .map((m) => getCpmmContractLoanUpdate(c, [m], netWorth))
      } else {
        return getCpmmContractLoanUpdate(c, metrics, netWorth)
      }
    })
  )
}

const getCpmmContractLoanUpdate = (
  contract: MarketContract,
  metrics: Omit<ContractMetric, 'id'>[],
  netWorth: number
) => {
  const metric = first(metrics)
  if (!metric) return undefined

  const invested = metric.invested
  const currentValue = metric.payout
  const loanAmount = metric.loan ?? 0

  const loanBasis = Math.min(invested, currentValue)
  let newLoan = calculateNewLoan(loanBasis, loanAmount)
  if (!isFinite(newLoan) || newLoan <= 0) return undefined

  // Limit total loan on a position to 2% of net worth
  const maxLoanForPosition = netWorth * MAX_LOAN_NET_WORTH_PERCENT
  const potentialTotalLoan = loanAmount + newLoan

  if (potentialTotalLoan > maxLoanForPosition) {
    // Adjust the new loan to respect the 2% limit
    newLoan = Math.max(0, maxLoanForPosition - loanAmount)
    if (newLoan <= 0) return undefined
  }

  const loanTotal = loanAmount + newLoan

  return {
    userId: metric.userId,
    contractId: contract.id,
    answerId: metric.answerId,
    newLoan,
    loanTotal,
  }
}

export type LoanWithInterest = {
  contractId: string
  answerId: string | null
  principal: number
  interest: number
  total: number
  lastUpdateTime: number
}

export const calculateLoanWithInterest = (
  metric: ContractMetric,
  tracking: LoanTrackingRow | undefined,
  now: number = Date.now()
): LoanWithInterest => {
  const principal = metric.loan ?? 0
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
    // Legacy loan without tracking - no interest
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

export type RepaymentDistribution = {
  contractId: string
  answerId: string | null
  amountRepaid: number
  principalRepaid: number
  interestRepaid: number
}

export const distributeRepaymentFIFO = (
  repaymentAmount: number,
  loans: LoanWithInterest[]
): RepaymentDistribution[] => {
  // Sort by lastUpdateTime (oldest first)
  const sortedLoans = [...loans].sort(
    (a, b) => a.lastUpdateTime - b.lastUpdateTime
  )

  const distributions: RepaymentDistribution[] = []
  let remaining = repaymentAmount

  for (const loan of sortedLoans) {
    if (remaining <= 0) break
    if (loan.total <= 0) continue

    const amountToRepay = Math.min(remaining, loan.total)
    const principalRatio = loan.principal / loan.total
    const interestRatio = loan.interest / loan.total

    distributions.push({
      contractId: loan.contractId,
      answerId: loan.answerId,
      amountRepaid: amountToRepay,
      principalRepaid: amountToRepay * principalRatio,
      interestRepaid: amountToRepay * interestRatio,
    })

    remaining -= amountToRepay
  }

  return distributions
}

export const calculateMaxGeneralLoanAmount = (netWorth: number): number => {
  return netWorth * MAX_LOAN_NET_WORTH_PERCENT
}

export const calculateDailyLoanLimit = (netWorth: number): number => {
  return netWorth * DAILY_LOAN_NET_WORTH_PERCENT
}

export const isMarketLiquid = (contract: MarketContract): boolean => {
  const now = Date.now()
  const marketAgeDays = (now - contract.createdTime) / MS_PER_DAY

  return (
    marketAgeDays >= MIN_MARKET_AGE_DAYS &&
    contract.uniqueBettorCount >= MIN_UNIQUE_TRADERS &&
    contract.volume >= MIN_VOLUME
  )
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
