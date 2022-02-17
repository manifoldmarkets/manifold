import * as _ from 'lodash'
import { Bet } from './bet'
import { Contract } from './contract'
import { FEES } from './fees'

export function getProbability(totalShares: { [outcome: string]: number }) {
  // For binary contracts only.
  return getOutcomeProbability(totalShares, 'YES')
}

export function getOutcomeProbability(
  totalShares: {
    [outcome: string]: number
  },
  outcome: string
) {
  const squareSum = _.sumBy(Object.values(totalShares), (shares) => shares ** 2)
  const shares = totalShares[outcome] ?? 0
  return shares ** 2 / squareSum
}

export function getProbabilityAfterBet(
  totalShares: {
    [outcome: string]: number
  },
  outcome: string,
  bet: number
) {
  const shares = calculateShares(totalShares, bet, outcome)

  const prevShares = totalShares[outcome] ?? 0
  const newTotalShares = { ...totalShares, [outcome]: prevShares + shares }

  return getOutcomeProbability(newTotalShares, outcome)
}

export function calculateShares(
  totalShares: {
    [outcome: string]: number
  },
  bet: number,
  betChoice: string
) {
  const squareSum = _.sumBy(Object.values(totalShares), (shares) => shares ** 2)
  const shares = totalShares[betChoice] ?? 0

  const c = 2 * bet * Math.sqrt(squareSum)

  return Math.sqrt(bet ** 2 + shares ** 2 + c) - shares
}

export function calculateRawShareValue(
  totalShares: {
    [outcome: string]: number
  },
  shares: number,
  betChoice: string
) {
  const currentValue = Math.sqrt(
    _.sumBy(Object.values(totalShares), (shares) => shares ** 2)
  )

  const postSaleValue = Math.sqrt(
    _.sumBy(Object.keys(totalShares), (outcome) =>
      outcome === betChoice
        ? Math.max(0, totalShares[outcome] - shares) ** 2
        : totalShares[outcome] ** 2
    )
  )

  return currentValue - postSaleValue
}

export function calculateMoneyRatio(
  contract: Contract,
  bet: Bet,
  shareValue: number
) {
  const { totalShares, totalBets, pool } = contract
  const { outcome, amount } = bet

  const p = getOutcomeProbability(totalShares, outcome)

  const actual = _.sum(Object.values(pool)) - shareValue

  const betAmount = p * amount

  const expected =
    _.sumBy(
      Object.keys(totalBets),
      (outcome) =>
        getOutcomeProbability(totalShares, outcome) *
        (totalBets as { [outcome: string]: number })[outcome]
    ) - betAmount

  if (actual <= 0 || expected <= 0) return 0

  return actual / expected
}

export function calculateShareValue(contract: Contract, bet: Bet) {
  const { pool, totalShares } = contract
  const { shares, outcome } = bet

  const shareValue = calculateRawShareValue(totalShares, shares, outcome)
  const f = calculateMoneyRatio(contract, bet, shareValue)

  const myPool = pool[outcome]
  const adjShareValue = Math.min(Math.min(1, f) * shareValue, myPool)
  return adjShareValue
}

export function calculateSaleAmount(contract: Contract, bet: Bet) {
  const { amount } = bet
  const winnings = calculateShareValue(contract, bet)
  return deductFees(amount, winnings)
}

export function calculatePayout(contract: Contract, bet: Bet, outcome: string) {
  if (outcome === 'CANCEL') return calculateCancelPayout(contract, bet)
  if (outcome === 'MKT') return calculateMktPayout(contract, bet)

  return calculateStandardPayout(contract, bet, outcome)
}

export function calculateCancelPayout(contract: Contract, bet: Bet) {
  const { totalBets, pool } = contract
  const betTotal = _.sum(Object.values(totalBets))
  const poolTotal = _.sum(Object.values(pool))

  return (bet.amount / betTotal) * poolTotal
}

export function calculateStandardPayout(
  contract: Contract,
  bet: Bet,
  outcome: string
) {
  const { amount, outcome: betOutcome, shares } = bet
  if (betOutcome !== outcome) return 0

  const { totalShares, phantomShares, pool } = contract
  if (!totalShares[outcome]) return 0

  const poolTotal = _.sum(Object.values(pool))

  const total =
    totalShares[outcome] - (phantomShares ? phantomShares[outcome] : 0)

  const winnings = (shares / total) * poolTotal
  // profit can be negative if using phantom shares
  return amount + (1 - FEES) * Math.max(0, winnings - amount)
}

export function calculatePayoutAfterCorrectBet(contract: Contract, bet: Bet) {
  const { totalShares, pool, totalBets } = contract
  const { shares, amount, outcome } = bet

  const newContract = {
    ...contract,
    totalShares: {
      ...totalShares,
      [outcome]: totalShares[outcome] + shares,
    },
    pool: {
      ...pool,
      [outcome]: pool[outcome] + amount,
    },
    totalBets: {
      ...totalBets,
      [outcome]: totalBets[outcome] + amount,
    },
  }

  return calculateStandardPayout(newContract, bet, outcome)
}

function calculateMktPayout(contract: Contract, bet: Bet) {
  if (contract.outcomeType === 'BINARY')
    return calculateBinaryMktPayout(contract, bet)

  const { totalShares, pool } = contract

  const totalPool = _.sum(Object.values(pool))
  const sharesSquareSum = _.sumBy(
    Object.values(totalShares),
    (shares) => shares ** 2
  )

  const weightedShareTotal = _.sumBy(Object.keys(totalShares), (outcome) => {
    // Avoid O(n^2) by reusing sharesSquareSum for prob.
    const shares = totalShares[outcome]
    const prob = shares ** 2 / sharesSquareSum
    return prob * shares
  })

  const { outcome, amount, shares } = bet

  const betP = getOutcomeProbability(totalShares, outcome)
  const winnings = ((betP * shares) / weightedShareTotal) * totalPool

  return deductFees(amount, winnings)
}

function calculateBinaryMktPayout(contract: Contract, bet: Bet) {
  const { resolutionProbability, totalShares, phantomShares } = contract
  const p =
    resolutionProbability !== undefined
      ? resolutionProbability
      : getProbability(totalShares)

  const pool = contract.pool.YES + contract.pool.NO

  const weightedShareTotal =
    p * (totalShares.YES - (phantomShares?.YES ?? 0)) +
    (1 - p) * (totalShares.NO - (phantomShares?.NO ?? 0))

  const { outcome, amount, shares } = bet

  const betP = outcome === 'YES' ? p : 1 - p
  const winnings = ((betP * shares) / weightedShareTotal) * pool

  return deductFees(amount, winnings)
}

export function resolvedPayout(contract: Contract, bet: Bet) {
  if (contract.resolution)
    return calculatePayout(contract, bet, contract.resolution)
  throw new Error('Contract was not resolved')
}

export const deductFees = (betAmount: number, winnings: number) => {
  return winnings > betAmount
    ? betAmount + (1 - FEES) * (winnings - betAmount)
    : winnings
}
