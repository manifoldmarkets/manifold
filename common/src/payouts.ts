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

// The share of a whole-market provision that went to an answer, which a
// cancellation refunds (getIndependentMultiCancelPayouts).
//
// One that records its answers went to them in equal shares, as each one's
// own pending subsidy, and to no other answer. That share is known, and is
// refunded like a provision made to the answer itself.
//
// One that doesn't went into the market's pending pool, which the drizzle
// moved into the answers open at each tick. It is credited in equal shares to
// the answers open when it was made. That is an estimate: an answer listed
// while the pool was still draining took some of it from them, and one
// reopened later looks as if it had been open all along. The cancellation
// makes up for it out of what the answer holds beyond these shares
// (getFurtherCancelRefund).
//
// An older market's unrecorded ante is different: it stands for the funding
// of its answers at creation and of answers added later, all dated at the
// market's creation, in amounts it doesn't break down. It is credited in
// equal shares to the answers without an ante of their own: an answer listed
// since antes recorded their answer has its own, and none of this. (Its share
// was amount / number of answers, which fell with every answer listed since
// and left part of what the older answers hold with nobody.)
const getCancelRefundShare = (
  l: LiquidityProvision,
  answer: Answer,
  answers: Answer[],
  ownAnteAnswerIds: Set<string>
) => {
  if (l.answerIds)
    return l.answerIds.includes(answer.id) ? l.amount / l.answerIds.length : 0
  // A withdrawal recorded against the whole market is charged as it always
  // was.
  if (!(l.amount > 0)) return l.amount / answers.length
  if (l.isAnte) {
    if (ownAnteAnswerIds.has(answer.id)) return 0
    return l.amount / answers.filter((a) => !ownAnteAnswerIds.has(a.id)).length
  }
  const openThen = answers.filter(
    (a) =>
      a.createdTime <= l.createdTime + UNRECORDED_PROVISION_GRACE_MS &&
      (a.resolutionTime ?? Infinity) >= l.createdTime
  )
  return openThen.some((a) => a.id === answer.id)
    ? l.amount / openThen.length
    : 0
}

// How much more of a whole-market provision than that share an answer can be
// holding: the rest of it, at most. A provision that went through the
// market's pending pool can have reached any answer in another amount than
// its estimated share. An older ante went into the answers it was for in
// amounts it doesn't record, so one of them can hold more of it than an equal
// share, and no other answer any. One that records its answers went to them
// directly: none.
const getFurtherCancelRefund = (l: LiquidityProvision, share: number) =>
  l.answerIds || !(l.amount > 0) || (l.isAnte && !(share > 0))
    ? 0
    : l.amount - Math.max(share, 0)

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
      // its share of each whole-market provision (getCancelRefundShare), and
      // what it holds beyond those: of the older antes first, whose funding
      // of the answer is the surer, then of the provisions that went through
      // the market's pending pool (getFurtherCancelRefund).
      const ownAnteAnswerIds = new Set(
        liquidities.flatMap((l) => (l.isAnte && l.answerId ? [l.answerId] : []))
      )
      const recordedLiquidities: LiquidityProvision[] = []
      const estimatedLiquidities: LiquidityProvision[] = []
      const furtherAnteLiquidities: LiquidityProvision[] = []
      const furtherPooledLiquidities: LiquidityProvision[] = []
      for (const l of wholeMarketLiquidities) {
        const share = getCancelRefundShare(
          l,
          answer,
          contract.answers,
          ownAnteAnswerIds
        )
        // A provision whose amount isn't a number is refunded nothing, rather
        // than make every sum it enters not a number.
        if (!Number.isFinite(share)) continue
        if (share !== 0)
          (l.answerIds ? recordedLiquidities : estimatedLiquidities).push({
            ...l,
            amount: share,
          })
        const further = getFurtherCancelRefund(l, share)
        if (further > 0)
          (l.isAnte ? furtherAnteLiquidities : furtherPooledLiquidities).push({
            ...l,
            amount: further,
          })
      }
      return getIndependentMultiCancelPayouts(
        answer,
        contractMetrics,
        answerLiquidities.concat(recordedLiquidities),
        estimatedLiquidities,
        contractSubsidyPoolShare,
        [furtherAnteLiquidities, furtherPooledLiquidities]
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
