import { Bet } from './bet'
import { getProbability } from './calculate'
import { CPMM2Contract, CPMMContract } from './contract'
import { getProb } from './calculate-cpmm-multi'

export function calculateFixedPayout(
  contract: CPMMContract | CPMM2Contract,
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
  contract: CPMMContract | CPMM2Contract,
  bet: Bet
) {
  const { outcome, shares } = bet

  if (
    contract.outcomeType === 'BINARY' ||
    contract.outcomeType === 'PSEUDO_NUMERIC'
  ) {
    const { resolutionProbability } = contract
    const p =
      resolutionProbability !== undefined
        ? resolutionProbability
        : getProbability(contract)

    const betP = outcome === 'YES' ? p : 1 - p

    return betP * shares
  }

  let p: number | undefined
  if (contract.resolutions) {
    p = contract.resolutions[outcome] ?? 0
  } else {
    p = getProb(contract.pool, outcome)
  }
  return p * shares
}
