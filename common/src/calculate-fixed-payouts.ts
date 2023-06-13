import { sum } from 'lodash'
import { Bet } from './bet'
import { getProbability } from './calculate'
import { CPMMContract, CPMMMultiContract } from './contract'

export function calculateFixedPayout(
  contract: CPMMContract,
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

function calculateFixedMktPayout(contract: CPMMContract, bet: Bet) {
  const { resolutionProbability } = contract
  const prob =
    resolutionProbability !== undefined
      ? resolutionProbability
      : getProbability(contract)

  const { outcome, shares } = bet
  const betP = outcome === 'YES' ? prob : 1 - prob
  return betP * shares
}

function calculateBetPayoutMulti(contract: CPMMMultiContract, bet: Bet) {
  let prob = 0
  const { answerId } = bet
  if (answerId) {
    const { resolutions } = contract
    if (resolutions) {
      const probTotal = sum(Object.values(resolutions))
      prob = (resolutions[answerId] ?? 0) / probTotal
    } else {
      const { answers } = contract
      const answer = answers.find((a) => a.id === answerId)
      if (answer) prob = answer.prob
    }
  }
  const { outcome, shares } = bet
  const betP = outcome === 'YES' ? prob : 1 - prob
  return betP * shares
}

export function calculateFixedPayoutMulti(
  contract: CPMMMultiContract,
  bet: Bet,
  outcome: string
) {
  if (outcome === 'CANCEL') return calculateFixedCancelPayout(bet)
  return calculateBetPayoutMulti(contract, bet)
}
