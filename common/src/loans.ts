import { Dictionary, sumBy, first } from 'lodash'
import { MarketContract } from './contract'
import { PortfolioMetrics } from './portfolio-metrics'
import { ContractMetric } from './contract-metric'
import { filterDefined } from './util/array'

export const LOAN_DAILY_RATE = 0.04

const calculateNewLoan = (investedValue: number, loanTotal: number) => {
  const netValue = investedValue - loanTotal
  return netValue * LOAN_DAILY_RATE
}

export const getUserLoanUpdates = (
  metricsByContractId: Dictionary<Omit<ContractMetric, 'id'>[]>,
  contractsById: Dictionary<MarketContract>
) => {
  const updates = calculateLoanMetricUpdates(metricsByContractId, contractsById)
  return { updates, payout: sumBy(updates, (update) => update.newLoan) }
}

export const overLeveraged = (loanTotal: number, investmentValue: number) =>
  loanTotal / investmentValue >= 8

export const isUserEligibleForLoan = (
  portfolio: PortfolioMetrics & { userId: string }
) => {
  const { investmentValue, loanTotal } = portfolio
  return investmentValue > 0 && !overLeveraged(loanTotal ?? 0, investmentValue)
}

const calculateLoanMetricUpdates = (
  metricsByContractId: Dictionary<Omit<ContractMetric, 'id'>[]>,
  contractsById: Dictionary<MarketContract>
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
              m.answerId !== null &&
              !c.answers.find((a) => a.id === m.answerId)?.resolutionTime
          )
          .map((m) => getCpmmContractLoanUpdate(c, [m]))
      } else {
        return getCpmmContractLoanUpdate(c, metrics)
      }
    })
  )
}

const getCpmmContractLoanUpdate = (
  contract: MarketContract,
  metrics: Omit<ContractMetric, 'id'>[]
) => {
  const metric = first(metrics)
  if (!metric) return undefined

  const invested = metric.invested
  const currentValue = metric.payout
  const loanAmount = metric.loan ?? 0

  const loanBasis = Math.min(invested, currentValue)
  const newLoan = calculateNewLoan(loanBasis, loanAmount)
  if (!isFinite(newLoan) || newLoan <= 0) return undefined

  const loanTotal = loanAmount + newLoan

  return {
    userId: metric.userId,
    contractId: contract.id,
    answerId: metric.answerId,
    newLoan,
    loanTotal,
  }
}
