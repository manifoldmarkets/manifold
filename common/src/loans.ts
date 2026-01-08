import { Dictionary, sumBy, first } from 'lodash'
import { MarketContract } from './contract'
import { PortfolioMetrics } from './portfolio-metrics'
import { ContractMetric, isSummary } from './contract-metric'
import { filterDefined } from './util/array'

export const LOAN_DAILY_RATE = 0.02
export const MAX_LOAN_NET_WORTH_PERCENT = 0.02
export const LOAN_DAILY_INTEREST_RATE = 0.0005 // 0.05% per day (~18.25% annually)
export const MS_PER_DAY = 24 * 60 * 60 * 1000

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
