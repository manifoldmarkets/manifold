import { Bet } from './bet'
import { getProbability } from './calculate'
import { Binary, FixedPayouts, FullContract } from './contract'
import { FEES } from './fees'

export function calculateFixedPayout(
  contract: FullContract<FixedPayouts, Binary>,
  bet: Bet,
  outcome: string
) {
  if (outcome === 'CANCEL') return calculateFixedCancelPayout(bet)
  if (outcome === 'MKT') return calculateFixedMktPayout(contract, bet)

  return calculateStandardFixedPayout(bet, outcome)
}

export function calculateFixedCancelPayout(bet: Bet) {
  return bet.amount
}

export function calculateStandardFixedPayout(bet: Bet, outcome: string) {
  const { amount, outcome: betOutcome, shares } = bet
  if (betOutcome !== outcome) return 0
  return deductFixedFees(amount, shares - amount)
}

function calculateFixedMktPayout(
  contract: FullContract<FixedPayouts, Binary>,
  bet: Bet
) {
  const { resolutionProbability } = contract
  const p =
    resolutionProbability !== undefined
      ? resolutionProbability
      : getProbability(contract)

  const { outcome, amount, shares } = bet

  const betP = outcome === 'YES' ? p : 1 - p
  const winnings = betP * shares

  return deductFixedFees(amount, winnings)
}

export const deductFixedFees = (betAmount: number, winnings: number) => {
  return winnings > betAmount
    ? betAmount + (1 - FEES) * (winnings - betAmount)
    : winnings
}
