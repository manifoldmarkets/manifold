import { maxBy, partition, sortBy, sum, sumBy } from 'lodash'
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
import { calculateFixedPayout } from './calculate-fixed-payouts'
import {
  Contract,
  BinaryContract,
  FreeResponseContract,
  PseudoNumericContract,
  MultipleChoiceContract,
} from './contract'
import { floatingEqual } from './util/math'

export function getProbability(
  contract: BinaryContract | PseudoNumericContract
) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmProbability(contract.pool, contract.p)
    : getDpmProbability(contract.totalShares)
}

export function getInitialProbability(
  contract: BinaryContract | PseudoNumericContract
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
  return contract.mechanism === 'cpmm-1'
    ? outcome === 'YES'
      ? getCpmmProbability(contract.pool, contract.p)
      : 1 - getCpmmProbability(contract.pool, contract.p)
    : contract.mechanism === 'cpmm-2'
    ? getProb(contract.pool, outcome)
    : getDpmOutcomeProbability(contract.totalShares, outcome)
}

export function getOutcomeProbabilityAfterBet(
  contract: Contract,
  outcome: string,
  bet: number
) {
  const { mechanism, pool } = contract
  return mechanism === 'cpmm-1'
    ? getCpmmOutcomeProbabilityAfterBet(contract, outcome, bet)
    : mechanism === 'cpmm-2'
    ? getProb(buy(pool, outcome, bet).newPool, outcome)
    : getDpmOutcomeProbabilityAfterBet(contract.totalShares, outcome, bet)
}

export function calculateSharesBought(
  contract: Contract,
  outcome: string,
  amount: number
) {
  const { mechanism, pool } = contract
  return mechanism === 'cpmm-1'
    ? calculateCpmmPurchase(contract, amount, outcome).shares
    : mechanism === 'cpmm-2'
    ? buy(pool, outcome, amount).shares
    : calculateDpmShares(contract.totalShares, amount, outcome)
}

export function calculatePayout(contract: Contract, bet: Bet, outcome: string) {
  const { mechanism } = contract
  return mechanism === 'cpmm-1' || mechanism === 'cpmm-2'
    ? calculateFixedPayout(contract, bet, outcome)
    : mechanism === 'dpm-2'
    ? calculateDpmPayout(contract, bet, outcome)
    : 0
}

export function resolvedPayout(contract: Contract, bet: Bet) {
  const { resolution, mechanism } = contract
  if (!resolution) throw new Error('Contract not resolved')

  return mechanism === 'cpmm-1' || mechanism === 'cpmm-2'
    ? calculateFixedPayout(contract, bet, resolution)
    : mechanism === 'dpm-2'
    ? calculateDpmPayout(contract, bet, resolution)
    : 0
}

// Note: Works for cpmm-1 and cpmm-2.
function getCpmmInvested(yourBets: Bet[]) {
  const totalShares: { [outcome: string]: number } = {}
  const totalSpent: { [outcome: string]: number } = {}

  const sortedBets = sortBy(yourBets, 'createdTime')
  const sharePurchases = sortedBets
    .map((bet) => {
      const { sharesByOutcome } = bet
      if (sharesByOutcome) {
        const shareSum = sum(Object.values(sharesByOutcome))
        return Object.entries(sharesByOutcome).map(([outcome, shares]) => ({
          outcome,
          shares,
          amount: (bet.amount * shares) / shareSum,
        }))
      }
      return [bet]
    })
    .flat()

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

export function getContractBetMetrics(contract: Contract, yourBets: Bet[]) {
  const { resolution, mechanism } = contract
  const isCpmm = mechanism === 'cpmm-1'

  let totalInvested = 0
  let payout = 0
  let loan = 0
  let saleValue = 0
  let redeemed = 0
  const totalShares: { [outcome: string]: number } = {}

  for (const bet of yourBets) {
    const {
      isSold,
      sale,
      amount,
      loanAmount,
      isRedemption,
      shares,
      sharesByOutcome,
      outcome,
    } = bet

    if (sharesByOutcome) {
      for (const [o, s] of Object.entries(sharesByOutcome)) {
        totalShares[o] = (totalShares[o] ?? 0) + s
      }
    } else {
      totalShares[outcome] = (totalShares[outcome] ?? 0) + shares
    }

    if (isSold) {
      totalInvested += amount
    } else if (sale) {
      saleValue += sale.amount
    } else {
      if (isRedemption) {
        redeemed += -1 * amount
      } else if (amount > 0) {
        totalInvested += amount
      } else {
        saleValue -= amount
      }

      loan += loanAmount ?? 0
      payout += resolution
        ? calculatePayout(contract, bet, resolution)
        : calculatePayout(contract, bet, 'MKT')
    }
  }

  const profit = payout + saleValue + redeemed - totalInvested
  const profitPercent = totalInvested === 0 ? 0 : (profit / totalInvested) * 100

  const invested = isCpmm ? getCpmmInvested(yourBets) : getDpmInvested(yourBets)
  const hasShares = Object.values(totalShares).some(
    (shares) => !floatingEqual(shares, 0)
  )

  const { YES: yesShares, NO: noShares } = totalShares
  const hasYesShares = yesShares >= 1
  const hasNoShares = noShares >= 1
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
    hasShares,
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
    lastBetTime: null,
  }
}

export function getTopAnswer(
  contract: FreeResponseContract | MultipleChoiceContract
) {
  const { answers } = contract
  const top = maxBy(
    answers?.map((answer) => ({
      answer,
      prob: getOutcomeProbability(contract, answer.id),
    })),
    ({ prob }) => prob
  )
  return top?.answer
}

export function getTopNSortedAnswers(
  contract: FreeResponseContract | MultipleChoiceContract,
  n: number
) {
  const { answers, resolution, resolutions } = contract

  const [winningAnswers, losingAnswers] = partition(
    answers,
    (answer) =>
      answer.id === resolution || (resolutions && resolutions[answer.id])
  )
  const sortedAnswers = [
    ...sortBy(winningAnswers, (answer) =>
      resolutions ? -1 * resolutions[answer.id] : 0
    ),
    ...sortBy(
      losingAnswers,
      (answer) => -1 * getOutcomeProbability(contract, answer.id)
    ),
  ].slice(0, n)
  return sortedAnswers
}

export function getLargestPosition(contract: Contract, userBets: Bet[]) {
  if (userBets.length === 0) {
    return null
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
