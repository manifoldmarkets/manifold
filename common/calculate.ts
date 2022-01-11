import { Bet } from './bet'
import { Contract } from './contract'
import { FEES } from './fees'

export function getProbability(totalShares: { YES: number; NO: number }) {
  const { YES: y, NO: n } = totalShares
  return y ** 2 / (y ** 2 + n ** 2)
}

export function getProbabilityAfterBet(
  totalShares: { YES: number; NO: number },
  outcome: 'YES' | 'NO',
  bet: number
) {
  const shares = calculateShares(totalShares, bet, outcome)

  const [YES, NO] =
    outcome === 'YES'
      ? [totalShares.YES + shares, totalShares.NO]
      : [totalShares.YES, totalShares.NO + shares]

  return getProbability({ YES, NO })
}

export function calculateShares(
  totalShares: { YES: number; NO: number },
  bet: number,
  betChoice: 'YES' | 'NO'
) {
  const [yesShares, noShares] = [totalShares.YES, totalShares.NO]

  const c = 2 * bet * Math.sqrt(yesShares ** 2 + noShares ** 2)

  return betChoice === 'YES'
    ? Math.sqrt(bet ** 2 + yesShares ** 2 + c) - yesShares
    : Math.sqrt(bet ** 2 + noShares ** 2 + c) - noShares
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

export function calculateMoneyRatio(contract: Contract) {
  const { totalShares, pool } = contract
  const [yesShares, noShares] = [totalShares.YES, totalShares.NO]

  const actual = pool.YES + pool.NO
  const expected = Math.sqrt(yesShares ** 2 + noShares ** 2)
  return actual / expected
}

export function calculateShareValue(contract: Contract, bet: Bet) {
  const shareValue = calculateRawShareValue(
    contract.totalShares,
    bet.shares,
    bet.outcome
  )
  const f = calculateMoneyRatio(contract)

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
  outcome: 'YES' | 'NO'
) {
  const { amount, outcome: betOutcome, shares } = bet
  if (betOutcome !== outcome) return 0

  const { totalShares, totalBets } = contract
  if (totalShares[outcome] === 0) return 0

  const truePool = contract.pool.YES + contract.pool.NO

  if (totalBets[outcome] >= truePool)
    return (amount / totalBets[outcome]) * truePool

  const total = totalShares[outcome] - totalBets[outcome]
  const winningsPool = truePool - totalBets[outcome]

  return (1 - FEES) * (amount + ((shares - amount) / total) * winningsPool)
}

export function calculatePayoutAfterCorrectBet(contract: Contract, bet: Bet) {
  return calculateStandardPayout(contract, bet, bet.outcome)
}

function calculateMktPayout(contract: Contract, bet: Bet) {
  const p =
    contract.pool.YES ** 2 / (contract.pool.YES ** 2 + contract.pool.NO ** 2)
  const weightedTotal =
    p * contract.totalBets.YES + (1 - p) * contract.totalBets.NO

  const truePool = contract.pool.YES + contract.pool.NO

  const betP = bet.outcome === 'YES' ? p : 1 - p

  if (weightedTotal >= truePool) {
    return ((betP * bet.amount) / weightedTotal) * truePool
  }

  const winningsPool = truePool - weightedTotal

  const weightedShareTotal =
    p * (contract.totalShares.YES - contract.totalBets.YES) +
    (1 - p) * (contract.totalShares.NO - contract.totalBets.NO)

  return (
    (1 - FEES) *
    (betP * bet.amount +
      ((betP * (bet.shares - bet.amount)) / weightedShareTotal) * winningsPool)
  )
}

export function resolvedPayout(contract: Contract, bet: Bet) {
  if (contract.resolution)
    return calculatePayout(contract, bet, contract.resolution)
  throw new Error('Contract was not resolved')
}

export function currentValue(contract: Contract, bet: Bet) {
  const prob = getProbability(contract.pool)
  const yesPayout = calculatePayout(contract, bet, 'YES')
  const noPayout = calculatePayout(contract, bet, 'NO')

  return prob * yesPayout + (1 - prob) * noPayout
}
