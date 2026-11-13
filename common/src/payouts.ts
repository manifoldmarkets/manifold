import { groupBy, mapValues, sumBy } from 'lodash'

import { Answer } from './answer'
import { getProbability } from './calculate'
import {
  Contract,
  CPMMContract,
  CPMMMultiContract,
  isMultiCpmm,
  tradingAllowed,
} from './contract'
import { ContractMetric } from './contract-metric'
import { LiquidityProvision } from './liquidity-provision'
import {
  getFixedCancelPayouts,
  getIndependentMultiCancelPayouts,
  getIndependentMultiMktPayouts,
  getIndependentMultiYesNoPayouts,
  getMktFixedPayouts,
  getMultiFixedPayouts,
  getStandardFixedPayouts,
} from './payouts-fixed'

export type Payout = {
  userId: string
  payout: number
  deposit?: number
}

// Returns loan payouts (negative values, as loans are deducted from payouts).
// Margin loan interest is calculated using the user_contract_loans table in resolve-market-helpers.ts.
export const getLoanPayouts = (
  contractMetrics: ContractMetric[],
  answerId?: string
): Payout[] => {
  const metricsWithLoans = contractMetrics
    // Include both free loans and margin loans
    .filter((metric) => (metric.loan ?? 0) > 0 || (metric.marginLoan ?? 0) > 0)
    .filter((metric) => (answerId ? metric.answerId === answerId : true))
  const metricsByUser = groupBy(metricsWithLoans, (metric) => metric.userId)
  const loansByUser = mapValues(metricsByUser, (metrics) =>
    // Sum both free loans and margin loans as negative (to deduct from payouts)
    sumBy(metrics, (metric) => -((metric.loan ?? 0) + (metric.marginLoan ?? 0)))
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
  // Set when cancelling an answer of an independent multiple choice market
  // refunded less of the liquidity provided to the whole market than
  // amount / number of answers, because the answer didn't hold it: by how much
  // (getIndependentMultiCancelPayouts).
  withheldLiquidityRefund?: number
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
  if (isMultiCpmm(contract) && !contract.shouldAnswersSumToOne && answerId) {
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
  if (isMultiCpmm(contract)) {
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
      liquidities,
      contract.subsidyPool
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

// An answer added this soon after a whole-market provision that doesn't record
// its answers counts as one it was made for: a market's first answers can be
// written a moment after its own provision, in the same transaction.
const UNRECORDED_PROVISION_GRACE_MS = 5 * 1000

// What a cancelled answer may refund of a whole-market provision, before the
// limit of what the answer holds (getIndependentMultiCancelPayouts).
//
// One that records its answers went to them in equal shares, as each one's
// own pending subsidy, and to no other answer.
//
// One that doesn't went into the market's pending pool, which the drizzle
// moved into the answers open at each tick. It is credited in equal shares to
// the answers open when it was made. An answer that wasn't open then can
// still hold some of it, if it was listed before the pool had drained, so it
// keeps the share every answer had before provisions recorded their answers,
// amount / number of answers: more than it holds of the provision in most
// cases, and the limit brings the refund down to that.
//
// An older market's unrecorded ante is different: it stands for the funding
// of its answers at creation and of answers added later, all dated at the
// market's creation, in amounts it doesn't break down. It keeps the old share
// for answers without an ante of their own.
const getCancelRefundShare = (
  l: LiquidityProvision,
  answer: Answer,
  answers: Answer[],
  ownAnteAnswerIds: Set<string>
) => {
  if (l.answerIds)
    return l.answerIds.includes(answer.id) ? l.amount / l.answerIds.length : 0
  const oldShare = l.amount / answers.length
  if (l.isAnte) return ownAnteAnswerIds.has(answer.id) ? 0 : oldShare
  const openThen = answers.filter(
    (a) =>
      a.createdTime <= l.createdTime + UNRECORDED_PROVISION_GRACE_MS &&
      (a.resolutionTime ?? Infinity) >= l.createdTime
  )
  return openThen.some((a) => a.id === answer.id)
    ? l.amount / openThen.length
    : oldShare
}

export const getIndependentMultiFixedPayouts = (
  answer: Answer,
  outcome: string | undefined,
  contract: CPMMMultiContract,
  contractMetrics: ContractMetric[],
  liquidities: LiquidityProvision[],
  resolutionProbability: number
) => {
  const answerLiquidities = liquidities.filter((l) => l.answerId === answer.id)
  const wholeMarketLiquidities = liquidities.filter((l) => !l.answerId)
  // A whole-market provision went to the answers it records, in equal shares.
  // One that doesn't record them is divided by the number of answers.
  const sharedLiquidities = wholeMarketLiquidities.flatMap((l) =>
    l.answerIds
      ? l.answerIds.includes(answer.id)
        ? [{ ...l, amount: l.amount / l.answerIds.length }]
        : []
      : [{ ...l, amount: l.amount / contract.answers.length }]
  )
  const filteredLiquidities = answerLiquidities.concat(sharedLiquidities)
  // Divide contract's subsidy pool among UNRESOLVED answers only
  const unresolvedAnswers = contract.answers.filter((a) => !a.resolution)
  const numUnresolved = unresolvedAnswers.length || 1 // Avoid division by zero
  const contractSubsidyPoolShare = (contract.subsidyPool ?? 0) / numUnresolved
  switch (outcome) {
    case 'YES':
    case 'NO':
      return getIndependentMultiYesNoPayouts(
        answer,
        outcome,
        contractMetrics,
        filteredLiquidities,
        contractSubsidyPoolShare
      )
    case 'MKT':
      return getIndependentMultiMktPayouts(
        answer,
        contractMetrics,
        filteredLiquidities,
        resolutionProbability,
        contractSubsidyPoolShare
      )
    default:
    case 'CANCEL': {
      // A cancellation refunds what providers put into this answer, where the
      // outcomes above pay out its pool by their weights: its own provisions,
      // and its share of each whole-market provision (getCancelRefundShare),
      // as far as the answer holds it (getIndependentMultiCancelPayouts).
      // Unresolving an answer is refused once an unrecorded whole-market
      // provision came while it was resolved (unresolve.ts), so an answer open
      // now that was there when one was made was open then.
      const ownAnteAnswerIds = new Set(
        liquidities.flatMap((l) => (l.isAnte && l.answerId ? [l.answerId] : []))
      )
      const refundableSharedLiquidities = wholeMarketLiquidities.flatMap(
        (l) => {
          const amount = getCancelRefundShare(
            l,
            answer,
            contract.answers,
            ownAnteAnswerIds
          )
          return amount !== 0 ? [{ ...l, amount }] : []
        }
      )
      return getIndependentMultiCancelPayouts(
        answer,
        contractMetrics,
        answerLiquidities,
        refundableSharedLiquidities,
        contractSubsidyPoolShare
      )
    }
  }
}

export function getPayoutInfo(
  contract: Contract,
  metric: ContractMetric,
  answer?: Answer
) {
  const yesWinnings = metric.totalShares.YES ?? 0
  const noWinnings = metric.totalShares.NO ?? 0
  const position = yesWinnings - noWinnings
  const canSell = tradingAllowed(contract, answer)
  const won =
    (position > 1e-7 && (answer ?? contract).resolution === 'YES') ||
    (position < -1e-7 && (answer ?? contract).resolution === 'NO')

  return {
    canSell,
    won,
    payoutWord: canSell ? 'payout' : won ? 'paid out' : 'held out for',
  }
}
