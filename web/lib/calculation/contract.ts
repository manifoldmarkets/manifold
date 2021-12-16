import { Bet } from '../firebase/bets'
import { Contract } from '../firebase/contracts'

const fees = 0.02

export function getProbability(pot: { YES: number; NO: number }) {
  const [yesPot, noPot] = [pot.YES, pot.NO]
  const numerator = Math.pow(yesPot, 2)
  const denominator = Math.pow(yesPot, 2) + Math.pow(noPot, 2)
  return numerator / denominator
}

export function getProbabilityAfterBet(
  pot: { YES: number; NO: number },
  outcome: 'YES' | 'NO',
  bet: number
) {
  const [YES, NO] = [
    pot.YES + (outcome === 'YES' ? bet : 0),
    pot.NO + (outcome === 'NO' ? bet : 0),
  ]
  return getProbability({ YES, NO })
}

export function getDpmWeight(
  pot: { YES: number; NO: number },
  bet: number,
  betChoice: 'YES' | 'NO'
) {
  const [yesPot, noPot] = [pot.YES, pot.NO]

  return betChoice === 'YES'
    ? (bet * Math.pow(noPot, 2)) / (Math.pow(yesPot, 2) + bet * yesPot)
    : (bet * Math.pow(yesPot, 2)) / (Math.pow(noPot, 2) + bet * noPot)
}

export function calculatePayout(
  contract: Contract,
  bet: Bet,
  outcome: 'YES' | 'NO' | 'CANCEL'
) {
  const { amount, outcome: betOutcome, dpmWeight } = bet

  if (outcome === 'CANCEL') return amount
  if (betOutcome !== outcome) return 0

  let { dpmWeights, pot, seedAmounts } = contract

  // Fake data if not set.
  if (!dpmWeights) dpmWeights = { YES: 100, NO: 100 }

  // Fake data if not set.
  if (!pot) pot = { YES: 100, NO: 100 }

  const otherOutcome = outcome === 'YES' ? 'NO' : 'YES'
  const potSize = pot[otherOutcome] - seedAmounts[otherOutcome]

  return (1 - fees) * (dpmWeight / dpmWeights[outcome]) * potSize + amount
}
export function resolvedPayout(contract: Contract, bet: Bet) {
  if (contract.resolution)
    return calculatePayout(contract, bet, contract.resolution)
  throw new Error('Contract was not resolved')
}

export function currentValue(contract: Contract, bet: Bet) {
  const prob = getProbability(contract.pot)
  const yesPayout = calculatePayout(contract, bet, 'YES')
  const noPayout = calculatePayout(contract, bet, 'NO')

  return prob * yesPayout + (1 - prob) * noPayout
}
