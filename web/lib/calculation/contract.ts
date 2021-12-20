import { Bet } from '../firebase/bets'
import { Contract } from '../firebase/contracts'

const fees = 0.02

export function getProbability(pool: { YES: number; NO: number }) {
  const [yesPool, noPool] = [pool.YES, pool.NO]
  const numerator = Math.pow(yesPool, 2)
  const denominator = Math.pow(yesPool, 2) + Math.pow(noPool, 2)
  return numerator / denominator
}

export function getProbabilityAfterBet(
  pool: { YES: number; NO: number },
  outcome: 'YES' | 'NO',
  bet: number
) {
  const [YES, NO] = [
    pool.YES + (outcome === 'YES' ? bet : 0),
    pool.NO + (outcome === 'NO' ? bet : 0),
  ]
  return getProbability({ YES, NO })
}

export function calculateShares(
  pool: { YES: number; NO: number },
  bet: number,
  betChoice: 'YES' | 'NO'
) {
  const [yesPool, noPool] = [pool.YES, pool.NO]

  return betChoice === 'YES'
    ? bet + (bet * noPool ** 2) / (yesPool ** 2 + bet * yesPool)
    : bet + (bet * yesPool ** 2) / (noPool ** 2 + bet * noPool)
}

export function calculatePayout(
  contract: Contract,
  bet: Bet,
  outcome: 'YES' | 'NO' | 'CANCEL'
) {
  const { amount, outcome: betOutcome, shares } = bet

  if (outcome === 'CANCEL') return amount
  if (betOutcome !== outcome) return 0

  let { totalShares } = contract

  // Fake data if not set.
  // if (!totalShares) totalShares = { YES: 100, NO: 100 }

  const startPool = contract.startPool.YES + contract.startPool.NO
  const pool = contract.pool.YES + contract.pool.NO - startPool

  return (1 - fees) * (shares / totalShares[outcome]) * pool
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
