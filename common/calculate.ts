import _ from 'lodash'
import { Bet } from './bet'
import { Contract } from './contract'
import { FEES } from './fees'

export function getProbability(totalShares: { YES: number; NO: number }) {
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
  const newTotalShares = { ...totalShares, outcome: prevShares + shares }

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

export function calculateEstimatedWinnings(
  totalShares: { YES: number; NO: number },
  shares: number,
  betChoice: 'YES' | 'NO'
) {
  const ind = betChoice === 'YES' ? 1 : 0

  const yesShares = totalShares.YES + ind * shares
  const noShares = totalShares.NO + (1 - ind) * shares

  const estPool = Math.sqrt(yesShares ** 2 + noShares ** 2)
  const total = ind * yesShares + (1 - ind) * noShares

  return ((1 - FEES) * (shares * estPool)) / total
}

export function calculateRawShareValue(
  totalShares: { YES: number; NO: number },
  shares: number,
  betChoice: 'YES' | 'NO'
) {
  const [yesShares, noShares] = [totalShares.YES, totalShares.NO]
  const currentValue = Math.sqrt(yesShares ** 2 + noShares ** 2)

  const postSaleValue =
    betChoice === 'YES'
      ? Math.sqrt(Math.max(0, yesShares - shares) ** 2 + noShares ** 2)
      : Math.sqrt(yesShares ** 2 + Math.max(0, noShares - shares) ** 2)

  return currentValue - postSaleValue
}

export function calculateMoneyRatio(
  contract: Contract,
  bet: Bet,
  shareValue: number
) {
  const { totalShares, pool } = contract

  const p = getProbability(totalShares)

  const actual = pool.YES + pool.NO - shareValue

  const betAmount =
    bet.outcome === 'YES' ? p * bet.amount : (1 - p) * bet.amount

  const expected =
    p * contract.totalBets.YES + (1 - p) * contract.totalBets.NO - betAmount

  if (actual <= 0 || expected <= 0) return 0

  return actual / expected
}

export function calculateShareValue(contract: Contract, bet: Bet) {
  const shareValue = calculateRawShareValue(
    contract.totalShares,
    bet.shares,
    bet.outcome
  )
  const f = calculateMoneyRatio(contract, bet, shareValue)

  const myPool = contract.pool[bet.outcome]
  const adjShareValue = Math.min(Math.min(1, f) * shareValue, myPool)
  return adjShareValue
}

export function calculateSaleAmount(contract: Contract, bet: Bet) {
  return (1 - FEES) * calculateShareValue(contract, bet)
}

export function calculatePayout(
  contract: Contract,
  bet: Bet,
  outcome: 'YES' | 'NO' | 'CANCEL' | 'MKT'
) {
  if (outcome === 'CANCEL') return calculateCancelPayout(contract, bet)
  if (outcome === 'MKT') return calculateMktPayout(contract, bet)

  return calculateStandardPayout(contract, bet, outcome)
}

export function calculateCancelPayout(contract: Contract, bet: Bet) {
  const totalBets = contract.totalBets.YES + contract.totalBets.NO
  const pool = contract.pool.YES + contract.pool.NO

  return (bet.amount / totalBets) * pool
}

export function calculateStandardPayout(
  contract: Contract,
  bet: Bet,
  outcome: string
) {
  const { amount, outcome: betOutcome, shares } = bet
  if (betOutcome !== outcome) return 0

  const { totalShares, totalBets, phantomShares } = contract
  if (!totalShares[outcome]) return 0

  const truePool = _.sum(Object.values(totalShares))

  if (totalBets[outcome] >= truePool)
    return (amount / totalBets[outcome]) * truePool

  const total =
    totalShares[outcome] - phantomShares[outcome] - totalBets[outcome]
  const winningsPool = truePool - totalBets[outcome]

  return amount + (1 - FEES) * ((shares - amount) / total) * winningsPool
}

export function calculatePayoutAfterCorrectBet(contract: Contract, bet: Bet) {
  const { totalShares, pool, totalBets } = contract

  const ind = bet.outcome === 'YES' ? 1 : 0
  const { shares, amount } = bet

  const newContract = {
    ...contract,
    totalShares: {
      YES: totalShares.YES + ind * shares,
      NO: totalShares.NO + (1 - ind) * shares,
    },
    pool: {
      YES: pool.YES + ind * amount,
      NO: pool.NO + (1 - ind) * amount,
    },
    totalBets: {
      YES: totalBets.YES + ind * amount,
      NO: totalBets.NO + (1 - ind) * amount,
    },
  }

  return calculateStandardPayout(newContract, bet, bet.outcome)
}

function calculateMktPayout(contract: Contract, bet: Bet) {
  const p =
    contract.resolutionProbability !== undefined
      ? contract.resolutionProbability
      : getProbability(contract.totalShares)

  const weightedTotal =
    p * contract.totalBets.YES + (1 - p) * contract.totalBets.NO

  const truePool = contract.pool.YES + contract.pool.NO

  const betP = bet.outcome === 'YES' ? p : 1 - p

  if (weightedTotal >= truePool) {
    return ((betP * bet.amount) / weightedTotal) * truePool
  }

  const winningsPool = truePool - weightedTotal

  const weightedShareTotal =
    p *
      (contract.totalShares.YES -
        contract.phantomShares.YES -
        contract.totalBets.YES) +
    (1 - p) *
      (contract.totalShares.NO -
        contract.phantomShares.NO -
        contract.totalBets.NO)

  return (
    betP * bet.amount +
    (1 - FEES) *
      ((betP * (bet.shares - bet.amount)) / weightedShareTotal) *
      winningsPool
  )
}

export function resolvedPayout(contract: Contract, bet: Bet) {
  if (contract.resolution)
    return calculatePayout(contract, bet, contract.resolution)
  throw new Error('Contract was not resolved')
}

// deprecated use MKT payout
export function currentValue(contract: Contract, bet: Bet) {
  const prob = getProbability(contract.pool)
  const yesPayout = calculatePayout(contract, bet, 'YES')
  const noPayout = calculatePayout(contract, bet, 'NO')

  return prob * yesPayout + (1 - prob) * noPayout
}
