import { Bet } from '../firebase/bets'
import { Contract } from '../firebase/contracts'

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

export function calculateWinnings(
  contract: Contract,
  bet: Bet,
  outcome: 'YES' | 'NO' | 'CANCEL'
) {
  let { dpmWeights, pot } = contract
  const { amount, outcome: betOutcome, dpmWeight } = bet

  if (outcome === 'CANCEL') return amount

  if (!dpmWeights) {
    // Fake data if not set.
    dpmWeights = { YES: 100, NO: 100 }
  }
  // Fake data if not set.
  if (!pot) pot = { YES: 100, NO: 100 }

  return betOutcome === outcome
    ? 0.98 *
        (dpmWeight / dpmWeights[outcome]) *
        pot[outcome === 'YES' ? 'NO' : 'YES'] +
        amount
    : 0
}

export function currentValue(contract: Contract, bet: Bet) {
  const prob = getProbability(contract.pot)
  const yesWinnings = calculateWinnings(contract, bet, 'YES')
  const noWinnings = calculateWinnings(contract, bet, 'NO')

  return prob * yesWinnings + (1 - prob) * noWinnings
}
