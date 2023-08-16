import {
  groupBy,
  keyBy,
  mapValues,
  maxBy,
  partition,
  sortBy,
  sum,
  sumBy,
} from 'lodash'
import { Bet } from './bet'
import {
  getCpmmProbability,
  getCpmmOutcomeProbabilityAfterBet,
  calculateCpmmPurchase,
} from './calculate-cpmm'
import { buy, getProb } from './calculate-cpmm-multi'
import {
  calculateDpmPayout,
  getDpmOutcomeProbability,
  getDpmProbability,
  getDpmOutcomeProbabilityAfterBet,
  calculateDpmShares,
} from './calculate-dpm'
import {
  calculateFixedPayout,
  calculateFixedPayoutMulti,
} from './calculate-fixed-payouts'
import {
  Contract,
  BinaryContract,
  PseudoNumericContract,
  StonkContract,
  MultiContract,
} from './contract'
import { floatingEqual } from './util/math'
import { ContractMetric } from 'common/contract-metric'
import { Answer, DpmAnswer } from './answer'

export function getProbability(
  contract: BinaryContract | PseudoNumericContract | StonkContract
) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmProbability(contract.pool, contract.p)
    : getDpmProbability(contract.totalShares)
}

export function getDisplayProbability(
  contract: BinaryContract | PseudoNumericContract | StonkContract
) {
  return contract.resolutionProbability ?? getProbability(contract)
}

export function getInitialProbability(
  contract: BinaryContract | PseudoNumericContract | StonkContract
) {
  if (contract.initialProbability) return contract.initialProbability

  if (contract.mechanism === 'dpm-2' || (contract as any).totalShares)
    // use totalShares to calculate prob for ported contracts
    return getDpmProbability(
      (contract as any).phantomShares ?? (contract as any).totalShares
    )

  return getCpmmProbability(contract.pool, contract.p)
}

export function getOutcomeProbability(contract: Contract, outcome: string) {
  const { mechanism } = contract
  switch (mechanism) {
    case 'cpmm-1':
      return outcome === 'YES'
        ? getCpmmProbability(contract.pool, contract.p)
        : 1 - getCpmmProbability(contract.pool, contract.p)
    case 'cpmm-2':
      return getProb(contract.pool, outcome)
    case 'dpm-2':
      return getDpmOutcomeProbability(contract.totalShares, outcome)
    case 'cpmm-multi-1':
      return 0
    default:
      throw new Error('getOutcomeProbability not implemented')
  }
}

export function getAnswerProbability(
  contract: MultiContract,
  answerId: string
) {
  if (contract.mechanism === 'dpm-2') {
    return getDpmOutcomeProbability(contract.totalShares, answerId)
  }

  if (contract.mechanism === 'cpmm-multi-1') {
    const answer = contract.answers.find((a) => a.id === answerId)
    if (!answer) return 0

    const { poolYes, poolNo } = answer
    const pool = { YES: poolYes, NO: poolNo }
    return getCpmmProbability(pool, 0.5)
  }

  if (contract.mechanism === 'cpmm-2') {
    return 0
  }

  throw new Error(
    'getAnswerProbability not implemented for mechanism ' +
      (contract as any).mechanism
  )
}

export function getOutcomeProbabilityAfterBet(
  contract: Contract,
  outcome: string,
  bet: number
) {
  const { mechanism } = contract
  switch (mechanism) {
    case 'cpmm-1':
      return getCpmmOutcomeProbabilityAfterBet(contract, outcome, bet)
    case 'cpmm-2':
      return getProb(buy(contract.pool, outcome, bet).newPool, outcome)
    case 'dpm-2':
      return getDpmOutcomeProbabilityAfterBet(
        contract.totalShares,
        outcome,
        bet
      )
    case 'cpmm-multi-1':
      return 0
    default:
      throw new Error('getOutcomeProbabilityAfterBet not implemented')
  }
}

export function getOutcomeProbabilityAfterBetMulti(
  answers: Answer[],
  answerId: string,
  outcome: 'YES' | 'NO',
  amount: number
) {
  const answer = answers.find((a) => a.id === answerId)
  if (!answer) throw new Error('Answer not found')

  const { poolYes, poolNo } = answer

  return getCpmmOutcomeProbabilityAfterBet(
    {
      pool: { YES: poolYes, NO: poolNo },
      p: 0.5,
    },
    outcome,
    amount
  )
}

export function calculateSharesBought(
  contract: Contract,
  outcome: string,
  amount: number
) {
  const { mechanism } = contract
  switch (mechanism) {
    case 'cpmm-1':
      return calculateCpmmPurchase(contract, amount, outcome).shares
    case 'cpmm-2':
      return buy(contract.pool, outcome, amount).shares
    case 'dpm-2':
      return calculateDpmShares(contract.totalShares, amount, outcome)
    default:
      throw new Error('calculateSharesBought not implemented')
  }
}
export function calculateSharesBoughtMulti(
  answers: Answer[],
  answerId: string,
  outcome: 'YES' | 'NO',
  amount: number
) {
  const answer = answers.find((a) => a.id === answerId)
  if (!answer) throw new Error('Answer not found')

  const { poolYes, poolNo } = answer

  return calculateCpmmPurchase(
    { pool: { YES: poolYes, NO: poolNo }, p: 0.5 },
    amount,
    outcome
  ).shares
}

export function calculatePayout(contract: Contract, bet: Bet, outcome: string) {
  const { mechanism } = contract
  return mechanism === 'cpmm-1'
    ? calculateFixedPayout(contract, bet, outcome)
    : mechanism === 'cpmm-multi-1'
    ? calculateFixedPayoutMulti(contract, bet, outcome)
    : mechanism === 'dpm-2'
    ? calculateDpmPayout(contract, bet, outcome)
    : bet?.amount ?? 0
}

export function resolvedPayout(contract: Contract, bet: Bet) {
  const { resolution, mechanism } = contract
  if (!resolution) throw new Error('Contract not resolved')

  return mechanism === 'cpmm-1'
    ? calculateFixedPayout(contract, bet, resolution)
    : mechanism === 'cpmm-multi-1'
    ? calculateFixedPayoutMulti(contract, bet, resolution)
    : mechanism === 'dpm-2'
    ? calculateDpmPayout(contract, bet, resolution)
    : bet?.amount ?? 0
}

function getCpmmInvested(yourBets: Bet[]) {
  const totalShares: { [outcome: string]: number } = {}
  const totalSpent: { [outcome: string]: number } = {}

  const sortedBets = sortBy(yourBets, 'createdTime')
  const sharePurchases = sortedBets.map((bet) => [bet]).flat()

  for (const purchase of sharePurchases) {
    const { outcome, shares, amount } = purchase
    if (floatingEqual(shares, 0)) continue

    const spent = totalSpent[outcome] ?? 0
    const position = totalShares[outcome] ?? 0

    if (amount > 0) {
      totalShares[outcome] = position + shares
      totalSpent[outcome] = spent + amount
    } else if (amount < 0) {
      const averagePrice = position === 0 ? 0 : spent / position
      totalShares[outcome] = position + shares
      totalSpent[outcome] = spent + averagePrice * shares
    }
  }

  return sum(Object.values(totalSpent))
}

function getDpmInvested(yourBets: Bet[]) {
  const sortedBets = sortBy(yourBets, 'createdTime')

  return sumBy(sortedBets, (bet) => {
    const { amount, sale } = bet

    if (sale) {
      const originalBet = sortedBets.find((b) => b.id === sale.betId)
      if (originalBet) return -originalBet.amount
      return 0
    }

    return amount
  })
}

export function getInvested(contract: Contract, yourBets: Bet[]) {
  const { mechanism } = contract
  if (mechanism === 'cpmm-1') return getCpmmInvested(yourBets)
  if (mechanism === 'cpmm-multi-1') {
    const betsByAnswerId = groupBy(yourBets, 'answerId')
    const investedByAnswerId = mapValues(betsByAnswerId, getCpmmInvested)
    return sum(Object.values(investedByAnswerId))
  }
  return getDpmInvested(yourBets)
}

function getCpmmOrDpmProfit(contract: Contract, yourBets: Bet[]) {
  const { resolution } = contract

  let totalInvested = 0
  let payout = 0
  let saleValue = 0
  let redeemed = 0

  const betsById = keyBy(yourBets, 'id')
  const betIdToSaleBet = keyBy(
    yourBets.filter((b) => b.sale),
    (bet) => bet.sale!.betId
  )

  for (const bet of yourBets) {
    const { isSold, sale, amount, isRedemption } = bet

    if (isSold) {
      const saleBet = betIdToSaleBet[bet.id]
      if (saleBet) {
        // Only counts if the sale bet is also in the list.
        totalInvested += amount
      }
    } else if (sale) {
      if (betsById[sale.betId]) {
        // Only counts if the original bet is also in the list.
        saleValue += sale.amount
      }
    } else {
      if (isRedemption) {
        redeemed += -1 * amount
      } else if (amount > 0) {
        totalInvested += amount
      } else {
        saleValue -= amount
      }

      payout += resolution
        ? calculatePayout(contract, bet, resolution)
        : calculatePayout(contract, bet, 'MKT')
    }
  }

  const profit = payout + saleValue + redeemed - totalInvested
  const profitPercent = totalInvested === 0 ? 0 : (profit / totalInvested) * 100

  return {
    profit,
    profitPercent,
    totalInvested,
    payout,
  }
}

export function getProfitMetrics(contract: Contract, yourBets: Bet[]) {
  const { mechanism } = contract
  if (mechanism === 'cpmm-multi-1') {
    const betsByAnswerId = groupBy(yourBets, 'answerId')
    const profitMetricsPerAnswer = Object.values(betsByAnswerId).map((bets) =>
      getCpmmOrDpmProfit(contract, bets)
    )
    const profit = sumBy(profitMetricsPerAnswer, 'profit')
    const totalInvested = sumBy(profitMetricsPerAnswer, 'totalInvested')
    const profitPercent =
      totalInvested === 0 ? 0 : (profit / totalInvested) * 100
    const payout = sumBy(profitMetricsPerAnswer, 'payout')
    return {
      profit,
      profitPercent,
      totalInvested,
      payout,
    }
  }
  return getCpmmOrDpmProfit(contract, yourBets)
}

export function getCpmmShares(yourBets: Bet[]) {
  const totalShares: { [outcome: string]: number } = {}
  for (const bet of yourBets) {
    const { shares, outcome } = bet
    totalShares[outcome] = (totalShares[outcome] ?? 0) + shares
  }

  const hasShares = Object.values(totalShares).some(
    (shares) => !floatingEqual(shares, 0)
  )

  const { YES: yesShares, NO: noShares } = totalShares
  const hasYesShares = yesShares >= 1
  const hasNoShares = noShares >= 1

  return {
    totalShares,
    hasShares,
    hasYesShares,
    hasNoShares,
  }
}

export function getCpmmMultiShares(yourBets: Bet[]) {
  const betsByAnswerId = groupBy(yourBets, 'answerId')
  const sharesByAnswerId = mapValues(betsByAnswerId, (bets) =>
    getCpmmShares(bets)
  )

  const hasShares = Object.values(sharesByAnswerId).some(
    (shares) => shares.hasShares
  )

  return {
    hasShares,
    sharesByAnswerId,
  }
}

export const getContractBetMetrics = (contract: Contract, yourBets: Bet[]) => {
  const { mechanism } = contract
  const isCpmmMulti = mechanism === 'cpmm-multi-1'
  const { profit, profitPercent, payout } = getProfitMetrics(contract, yourBets)
  const invested = getInvested(contract, yourBets)
  const loan = sumBy(yourBets, 'loanAmount')

  const { totalShares, hasShares, hasYesShares, hasNoShares } =
    getCpmmShares(yourBets)
  const lastBetTime = Math.max(...yourBets.map((b) => b.createdTime))
  const maxSharesOutcome = hasShares
    ? maxBy(Object.keys(totalShares), (outcome) => totalShares[outcome])
    : null

  return {
    invested,
    loan,
    payout,
    profit,
    profitPercent,
    totalShares,
    hasShares: isCpmmMulti ? getCpmmMultiShares(yourBets).hasShares : hasShares,
    hasYesShares,
    hasNoShares,
    maxSharesOutcome,
    lastBetTime,
  }
}

export function getContractBetNullMetrics() {
  return {
    invested: 0,
    loan: 0,
    payout: 0,
    profit: 0,
    profitPercent: 0,
    totalShares: {} as { [outcome: string]: number },
    hasShares: false,
    hasYesShares: false,
    hasNoShares: false,
    maxSharesOutcome: null,
  } as ContractMetric
}
export function getTopAnswer(contract: MultiContract) {
  const { answers } = contract
  const top = maxBy<Answer | DpmAnswer>(answers, (answer) =>
    'prob' in answer ? answer.prob : getOutcomeProbability(contract, answer.id)
  )
  return top
}

export function getTopNSortedAnswers(contract: MultiContract, n: number) {
  const { answers, resolution, resolutions } = contract

  const [winningAnswers, losingAnswers] = partition(
    answers,
    (answer: Answer | DpmAnswer) =>
      answer.id === resolution || (resolutions && resolutions[answer.id])
    // Types were messed up with out this cast.
  ) as [(Answer | DpmAnswer)[], (Answer | DpmAnswer)[]]

  const sortedAnswers = [
    ...sortBy(winningAnswers, (answer) =>
      resolutions ? -1 * resolutions[answer.id] : 0
    ),
    ...sortBy(
      losingAnswers,
      (answer) => -1 * getAnswerProbability(contract, answer.id)
    ),
  ].slice(0, n)
  return sortedAnswers
}

export function getLargestPosition(contract: Contract, userBets: Bet[]) {
  if (userBets.length === 0) {
    return null
  }

  if (contract.mechanism === 'cpmm-multi-1') {
    const { sharesByAnswerId, hasShares } = getCpmmMultiShares(userBets)
    if (!hasShares) return null

    const answerId = maxBy(Object.keys(sharesByAnswerId), (answerId) =>
      Math.max(...Object.values(sharesByAnswerId[answerId].totalShares))
    )
    if (!answerId) return null
    const { totalShares } = sharesByAnswerId[answerId]

    const outcome = maxBy(
      Object.keys(totalShares),
      (outcome) => totalShares[outcome]
    )
    if (!outcome) return null

    return {
      answerId,
      outcome,
      shares: totalShares[outcome],
    }
  }

  const { totalShares, hasShares } = getContractBetMetrics(contract, userBets)
  if (!hasShares) return null

  const outcome = maxBy(
    Object.keys(totalShares),
    (outcome) => totalShares[outcome]
  )
  if (!outcome) return null

  const shares = totalShares[outcome]
  return { outcome, shares }
}
