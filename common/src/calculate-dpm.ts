import { sum, sumBy, mapValues } from 'lodash'
import { Bet, NumericBet } from './bet'
import { DPMBinaryContract, DPMContract } from './contract'
import { DPM_FEES } from './fees'

export function getDpmProbability(totalShares: { [outcome: string]: number }) {
  // For binary contracts only.
  return getDpmOutcomeProbability(totalShares, 'YES')
}

export function getDpmOutcomeProbability(
  totalShares: {
    [outcome: string]: number
  },
  outcome: string
) {
  const squareSum = sumBy(Object.values(totalShares), (shares) => shares ** 2)
  const shares = totalShares[outcome] ?? 0
  return shares ** 2 / squareSum
}

export function getDpmOutcomeProbabilities(totalShares: {
  [outcome: string]: number
}) {
  const squareSum = sumBy(Object.values(totalShares), (shares) => shares ** 2)
  return mapValues(totalShares, (shares) => shares ** 2 / squareSum)
}

export function getDpmOutcomeProbabilityAfterBet(
  totalShares: {
    [outcome: string]: number
  },
  outcome: string,
  bet: number
) {
  const shares = calculateDpmShares(totalShares, bet, outcome)

  const prevShares = totalShares[outcome] ?? 0
  const newTotalShares = { ...totalShares, [outcome]: prevShares + shares }

  return getDpmOutcomeProbability(newTotalShares, outcome)
}

export function getDpmProbabilityAfterSale(
  totalShares: {
    [outcome: string]: number
  },
  outcome: string,
  shares: number
) {
  const prevShares = totalShares[outcome] ?? 0
  const newTotalShares = { ...totalShares, [outcome]: prevShares - shares }

  const predictionOutcome = outcome === 'NO' ? 'YES' : outcome
  return getDpmOutcomeProbability(newTotalShares, predictionOutcome)
}

export function calculateDpmShares(
  totalShares: {
    [outcome: string]: number
  },
  bet: number,
  betChoice: string
) {
  const squareSum = sumBy(Object.values(totalShares), (shares) => shares ** 2)
  const shares = totalShares[betChoice] ?? 0

  const c = 2 * bet * Math.sqrt(squareSum)

  return Math.sqrt(bet ** 2 + shares ** 2 + c) - shares
}

export function calculateDpmRawShareValue(
  totalShares: {
    [outcome: string]: number
  },
  shares: number,
  betChoice: string
) {
  const currentValue = Math.sqrt(
    sumBy(Object.values(totalShares), (shares) => shares ** 2)
  )

  const postSaleValue = Math.sqrt(
    sumBy(Object.keys(totalShares), (outcome) =>
      outcome === betChoice
        ? Math.max(0, totalShares[outcome] - shares) ** 2
        : totalShares[outcome] ** 2
    )
  )

  return currentValue - postSaleValue
}

export function calculateDpmMoneyRatio(
  contract: DPMContract,
  bet: Bet,
  shareValue: number
) {
  const { totalShares, totalBets, pool } = contract
  const { outcome, amount } = bet

  const p = getDpmOutcomeProbability(totalShares, outcome)

  const actual = sum(Object.values(pool)) - shareValue

  const betAmount = p * amount

  const expected =
    sumBy(
      Object.keys(totalBets),
      (outcome) =>
        getDpmOutcomeProbability(totalShares, outcome) *
        (totalBets as { [outcome: string]: number })[outcome]
    ) - betAmount

  if (actual <= 0 || expected <= 0) return 0

  return actual / expected
}

export function calculateDpmShareValue(contract: DPMContract, bet: Bet) {
  const { pool, totalShares } = contract
  const { shares, outcome } = bet

  const shareValue = calculateDpmRawShareValue(totalShares, shares, outcome)
  const f = calculateDpmMoneyRatio(contract, bet, shareValue)

  const myPool = pool[outcome]
  const adjShareValue = Math.min(Math.min(1, f) * shareValue, myPool)
  return adjShareValue
}

export function calculateDpmSaleAmount(contract: DPMContract, bet: Bet) {
  const { amount } = bet
  const winnings = calculateDpmShareValue(contract, bet)
  return deductDpmFees(amount, winnings)
}

export function calculateDpmPayout(
  contract: DPMContract,
  bet: Bet,
  outcome: string
) {
  if (outcome === 'CANCEL') return calculateDpmCancelPayout(contract, bet)
  if (outcome === 'MKT') return calculateMktDpmPayout(contract, bet)

  return calculateStandardDpmPayout(contract, bet, outcome)
}

function calculateDpmCancelPayout(contract: DPMContract, bet: Bet) {
  const { totalBets, pool } = contract
  const betTotal = sum(Object.values(totalBets))
  const poolTotal = sum(Object.values(pool))

  return (bet.amount / betTotal) * poolTotal
}

export function calculateStandardDpmPayout(
  contract: DPMContract,
  bet: Bet,
  outcome: string
) {
  const { outcome: betOutcome } = bet
  const isNumeric = contract.outcomeType === 'NUMERIC'
  if (!isNumeric && betOutcome !== outcome) return 0

  const shares = isNumeric
    ? ((bet as NumericBet).allOutcomeShares ?? {})[outcome]
    : bet.shares

  if (!shares) return 0

  const { totalShares, phantomShares, pool } = contract
  if (!totalShares[outcome]) return 0

  const poolTotal = sum(Object.values(pool))

  const total =
    totalShares[outcome] - (phantomShares ? phantomShares[outcome] : 0)

  const winnings = (shares / total) * poolTotal

  const amount = isNumeric
    ? (bet as NumericBet).allBetAmounts[outcome]
    : bet.amount

  const payout = amount + (1 - DPM_FEES) * Math.max(0, winnings - amount)
  return payout
}

export function calculateDpmPayoutAfterCorrectBet(
  contract: DPMContract,
  bet: Bet
) {
  const { totalShares, pool, totalBets, outcomeType } = contract
  const { shares, amount, outcome } = bet

  const prevShares = totalShares[outcome] ?? 0
  const prevPool = pool[outcome] ?? 0
  const prevTotalBet = totalBets[outcome] ?? 0

  const newContract = {
    ...contract,
    totalShares: {
      ...totalShares,
      [outcome]: prevShares + shares,
    },
    pool: {
      ...pool,
      [outcome]: prevPool + amount,
    },
    totalBets: {
      ...totalBets,
      [outcome]: prevTotalBet + amount,
    },
    outcomeType:
      outcomeType === 'NUMERIC'
        ? 'FREE_RESPONSE' // hack to show payout at particular bet point estimate
        : outcomeType,
  }

  return calculateStandardDpmPayout(newContract as any, bet, outcome)
}

function calculateMktDpmPayout(contract: DPMContract, bet: Bet) {
  if (contract.outcomeType === 'BINARY')
    return calculateBinaryMktDpmPayout(contract, bet)

  const { totalShares, pool, resolutions } = contract

  let probs: { [outcome: string]: number }

  if (resolutions) {
    const probTotal = sum(Object.values(resolutions))
    probs = mapValues(
      totalShares,
      (_, outcome) => (resolutions[outcome] ?? 0) / probTotal
    )
  } else {
    const squareSum = sum(
      Object.values(totalShares).map((shares) => shares ** 2)
    )
    probs = mapValues(totalShares, (shares) => shares ** 2 / squareSum)
  }

  const { outcome, amount, shares } = bet

  const poolFrac = (probs[outcome] * shares) / totalShares[outcome]

  const totalPool = sum(Object.values(pool))
  const winnings = poolFrac * totalPool
  return deductDpmFees(amount, winnings)
}

function calculateBinaryMktDpmPayout(contract: DPMBinaryContract, bet: Bet) {
  const { resolutionProbability, totalShares, phantomShares } = contract
  const p =
    resolutionProbability !== undefined
      ? resolutionProbability
      : getDpmProbability(totalShares)

  const pool = contract.pool.YES + contract.pool.NO

  const weightedShareTotal =
    p * (totalShares.YES - (phantomShares?.YES ?? 0)) +
    (1 - p) * (totalShares.NO - (phantomShares?.NO ?? 0))

  const { outcome, amount, shares } = bet

  const betP = outcome === 'YES' ? p : 1 - p
  const winnings = ((betP * shares) / weightedShareTotal) * pool

  return deductDpmFees(amount, winnings)
}

export const deductDpmFees = (betAmount: number, winnings: number) => {
  return winnings > betAmount
    ? betAmount + (1 - DPM_FEES) * (winnings - betAmount)
    : winnings
}

export const calcDpmInitialPool = (
  initialProbInt: number,
  ante: number,
  phantomAnte: number
) => {
  const p = initialProbInt / 100.0
  const totalAnte = phantomAnte + ante

  const sharesYes = Math.sqrt(p * totalAnte ** 2)
  const sharesNo = Math.sqrt(totalAnte ** 2 - sharesYes ** 2)

  const poolYes = p * ante
  const poolNo = (1 - p) * ante

  const phantomYes = Math.sqrt(p) * phantomAnte
  const phantomNo = Math.sqrt(1 - p) * phantomAnte

  return { sharesYes, sharesNo, poolYes, poolNo, phantomYes, phantomNo }
}
