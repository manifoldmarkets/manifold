import { Bet } from './bet'
import { getProbability } from './calculate'
import { Binary, FixedPayouts, FullContract } from './contract'

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
  const { outcome: betOutcome, shares } = bet
  if (betOutcome !== outcome) return 0
  return shares
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

  const { outcome, shares } = bet

  const betP = outcome === 'YES' ? p : 1 - p

  return betP * shares
}
