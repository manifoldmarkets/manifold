import { Bet } from './bet'
import { getProbability } from './calculate'
import { CPMM2Contract, CPMMContract } from './contract'
import { getProb } from './calculate-cpmm-multi'
import { mapValues, sum } from 'lodash'

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
  const { outcome: betOutcome, shares, sharesByOutcome } = bet

  if (sharesByOutcome) {
    return sharesByOutcome[outcome] ?? 0
  }

  if (betOutcome !== outcome) return 0
  return shares
}

function calculateFixedMktPayout(
  contract: CPMMContract | CPMM2Contract,
  bet: Bet
) {
  const { outcome, shares, sharesByOutcome } = bet

  if (
    contract.outcomeType === 'BINARY' ||
    contract.outcomeType === 'PSEUDO_NUMERIC' ||
    contract.outcomeType === 'STONK'
  ) {
    const { resolutionProbability } = contract
    const p =
      resolutionProbability !== undefined
        ? resolutionProbability
        : getProbability(contract)

    const betP = outcome === 'YES' ? p : 1 - p

    return betP * shares
  }

  const { resolutions, pool } = contract
  const resolutionsSum = resolutions ? sum(Object.values(resolutions)) : 100

  let p: number
  if (resolutions) {
    p = (resolutions[outcome] ?? 0) / resolutionsSum
  } else {
    p = getProb(contract.pool, outcome)
  }

  if (sharesByOutcome) {
    return sum(
      Object.values(
        mapValues(sharesByOutcome, (s, o) => {
          const p = resolutions
            ? (resolutions[o] ?? 0) / resolutionsSum
            : getProb(pool, o)
          return s * p
        })
      )
    )
  }

  return p * shares
}
