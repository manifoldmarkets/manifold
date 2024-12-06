import { sumBy, groupBy, mapValues } from 'lodash'

import { Contract, CPMMContract, CPMMMultiContract } from './contract'
import { LiquidityProvision } from './liquidity-provision'
import {
  getFixedCancelPayouts,
  getIndependentMultiMktPayouts,
  getMktFixedPayouts,
  getMultiFixedPayouts,
  getStandardFixedPayouts,
  getIndependentMultiYesNoPayouts,
} from './payouts-fixed'
import { getProbability } from './calculate'
import { Answer } from './answer'
import { ContractMetric } from './contract-metric'

export type Payout = {
  userId: string
  payout: number
}
export const getLoanPayouts = (contractMetrics: ContractMetric[]): Payout[] => {
  const metricsWithLoans = contractMetrics.filter((metric) => metric.loan)
  const metricsByUser = groupBy(metricsWithLoans, (metric) => metric.userId)
  const loansByUser = mapValues(metricsByUser, (metrics) =>
    sumBy(metrics, (metric) => -(metric.loan ?? 0))
  )
  return Object.entries(loansByUser).map(([userId, payout]) => ({
    userId,
    payout,
  }))
}

export const groupPayoutsByUser = (payouts: Payout[]) => {
  const groups = groupBy(payouts, (payout) => payout.userId)
  return mapValues(groups, (group) => sumBy(group, (g) => g.payout))
}

export type PayoutInfo = {
  traderPayouts: Payout[]
  liquidityPayouts: Payout[]
}

export const getPayouts = (
  outcome: string | undefined,
  contract: Contract,
  contractMetrics: ContractMetric[],
  liquidities: LiquidityProvision[],
  resolutions?: {
    [outcome: string]: number
  },
  resolutionProbability?: number,
  answerId?: string | undefined
): PayoutInfo => {
  if (contract.mechanism === 'cpmm-1') {
    const prob = getProbability(contract)
    return getFixedPayouts(
      outcome,
      contract,
      contractMetrics,
      liquidities,
      resolutionProbability ?? prob
    )
  }
  if (
    contract.mechanism === 'cpmm-multi-1' &&
    !contract.shouldAnswersSumToOne &&
    answerId
  ) {
    const answer = contract.answers.find((a) => a.id === answerId)
    if (!answer) {
      throw new Error('getPayouts: answer not found for cpmm-multi-1')
    }
    return getIndependentMultiFixedPayouts(
      answer,
      outcome,
      contract as CPMMMultiContract,
      contractMetrics,
      liquidities,
      resolutionProbability ?? answer.prob
    )
  }
  if (contract.mechanism === 'cpmm-multi-1') {
    if (outcome === 'CANCEL') {
      return getFixedCancelPayouts(contractMetrics, liquidities)
    }
    if (!resolutions) {
      throw new Error('getPayouts: resolutions required for cpmm-multi-1')
    }
    // Includes equivalent of 'MKT' and 'YES/NO' resolutions.
    return getMultiFixedPayouts(
      contract.answers,
      resolutions,
      contractMetrics,
      liquidities
    )
  }
  throw new Error('getPayouts not implemented')
}

export const getFixedPayouts = (
  outcome: string | undefined,
  contract: CPMMContract,
  contractMetrics: ContractMetric[],
  liquidities: LiquidityProvision[],
  resolutionProbability: number
) => {
  switch (outcome) {
    case 'YES':
    case 'NO':
      return getStandardFixedPayouts(
        outcome,
        contract,
        contractMetrics,
        liquidities
      )
    case 'MKT':
      return getMktFixedPayouts(
        contract,
        contractMetrics,
        liquidities,
        resolutionProbability
      )
    default:
    case 'CANCEL':
      return getFixedCancelPayouts(contractMetrics, liquidities)
  }
}

export const getIndependentMultiFixedPayouts = (
  answer: Answer,
  outcome: string | undefined,
  contract: CPMMMultiContract,
  contractMetrics: ContractMetric[],
  liquidities: LiquidityProvision[],
  resolutionProbability: number
) => {
  const filteredLiquidities = liquidities
    .filter((l) => l.answerId === answer.id)
    // Also include liquidity that is not assigned to an answer, and divide it by the number of answers.
    .concat(
      liquidities
        .filter((l) => !l.answerId)
        .map((l) => ({ ...l, amount: l.amount / contract.answers.length }))
    )
  switch (outcome) {
    case 'YES':
    case 'NO':
      return getIndependentMultiYesNoPayouts(
        answer,
        outcome,
        contractMetrics,
        filteredLiquidities
      )
    case 'MKT':
      return getIndependentMultiMktPayouts(
        answer,
        contractMetrics,
        filteredLiquidities,
        resolutionProbability
      )
    default:
    case 'CANCEL':
      return getFixedCancelPayouts(contractMetrics, filteredLiquidities)
  }
}
