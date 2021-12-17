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

export function getDpmWeight(
  pool: { YES: number; NO: number },
  bet: number,
  betChoice: 'YES' | 'NO'
) {
  const [yesPool, noPool] = [pool.YES, pool.NO]

  return betChoice === 'YES'
    ? (bet * Math.pow(noPool, 2)) / (Math.pow(yesPool, 2) + bet * yesPool)
    : (bet * Math.pow(yesPool, 2)) / (Math.pow(noPool, 2) + bet * noPool)
}

export function calculatePayout(
  contract: Contract,
  bet: Bet,
  outcome: 'YES' | 'NO' | 'CANCEL'
) {
  const { amount, outcome: betOutcome, dpmWeight } = bet

  if (outcome === 'CANCEL') return amount
  if (betOutcome !== outcome) return 0

  let { dpmWeights, pool, startPool } = contract

  // Fake data if not set.
  if (!dpmWeights) dpmWeights = { YES: 100, NO: 100 }

  // Fake data if not set.
  if (!pool) pool = { YES: 100, NO: 100 }

  const otherOutcome = outcome === 'YES' ? 'NO' : 'YES'
  const poolSize = pool[otherOutcome] - startPool[otherOutcome]

  return (1 - fees) * (dpmWeight / dpmWeights[outcome]) * poolSize + amount
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
