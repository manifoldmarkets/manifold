import * as _ from 'lodash'
import { Bet } from './bet'
import { Binary, DPM, FreeResponse, FullContract } from './contract'
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
  const squareSum = _.sumBy(Object.values(totalShares), (shares) => shares ** 2)
  const shares = totalShares[outcome] ?? 0
  return shares ** 2 / squareSum
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
  const squareSum = _.sumBy(Object.values(totalShares), (shares) => shares ** 2)
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
    _.sumBy(Object.values(totalShares), (shares) => shares ** 2)
  )

  const postSaleValue = Math.sqrt(
    _.sumBy(Object.keys(totalShares), (outcome) =>
      outcome === betChoice
        ? Math.max(0, totalShares[outcome] - shares) ** 2
        : totalShares[outcome] ** 2
    )
  )

  return currentValue - postSaleValue
}

export function calculateDpmMoneyRatio(
  contract: FullContract<DPM, any>,
  bet: Bet,
  shareValue: number
) {
  const { totalShares, totalBets, pool } = contract
  const { outcome, amount } = bet

  const p = getDpmOutcomeProbability(totalShares, outcome)

  const actual = _.sum(Object.values(pool)) - shareValue

  const betAmount = p * amount

  const expected =
    _.sumBy(
      Object.keys(totalBets),
      (outcome) =>
        getDpmOutcomeProbability(totalShares, outcome) *
        (totalBets as { [outcome: string]: number })[outcome]
    ) - betAmount

  if (actual <= 0 || expected <= 0) return 0

  return actual / expected
}

export function calculateDpmShareValue(
  contract: FullContract<DPM, any>,
  bet: Bet
) {
  const { pool, totalShares } = contract
  const { shares, outcome } = bet

  const shareValue = calculateDpmRawShareValue(totalShares, shares, outcome)
  const f = calculateDpmMoneyRatio(contract, bet, shareValue)

  const myPool = pool[outcome]
  const adjShareValue = Math.min(Math.min(1, f) * shareValue, myPool)
  return adjShareValue
}

export function calculateDpmSaleAmount(
  contract: FullContract<DPM, any>,
  bet: Bet
) {
  const { amount } = bet
  const winnings = calculateDpmShareValue(contract, bet)
  return deductDpmFees(amount, winnings)
}

export function calculateDpmPayout(
  contract: FullContract<DPM, any>,
  bet: Bet,
  outcome: string
) {
  if (outcome === 'CANCEL') return calculateDpmCancelPayout(contract, bet)
  if (outcome === 'MKT') return calculateMktDpmPayout(contract, bet)

  return calculateStandardDpmPayout(contract, bet, outcome)
}

export function calculateDpmCancelPayout(
  contract: FullContract<DPM, any>,
  bet: Bet
) {
  const { totalBets, pool } = contract
  const betTotal = _.sum(Object.values(totalBets))
  const poolTotal = _.sum(Object.values(pool))

  return (bet.amount / betTotal) * poolTotal
}

export function calculateStandardDpmPayout(
  contract: FullContract<DPM, any>,
  bet: Bet,
  outcome: string
) {
  const { amount, outcome: betOutcome, shares } = bet
  if (betOutcome !== outcome) return 0

  const { totalShares, phantomShares, pool } = contract
  if (!totalShares[outcome]) return 0

  const poolTotal = _.sum(Object.values(pool))

  const total =
    totalShares[outcome] - (phantomShares ? phantomShares[outcome] : 0)

  const winnings = (shares / total) * poolTotal
  // profit can be negative if using phantom shares
  return amount + (1 - DPM_FEES) * Math.max(0, winnings - amount)
}

export function calculateDpmPayoutAfterCorrectBet(
  contract: FullContract<DPM, any>,
  bet: Bet
) {
  const { totalShares, pool, totalBets } = contract
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
  }

  return calculateStandardDpmPayout(newContract, bet, outcome)
}

function calculateMktDpmPayout(contract: FullContract<DPM, any>, bet: Bet) {
  if (contract.outcomeType === 'BINARY')
    return calculateBinaryMktDpmPayout(contract, bet)

  const { totalShares, pool, resolutions } = contract as FullContract<
    DPM,
    FreeResponse
  >

  if (!resolutions)
    throw new Error(
      'resolutions required for MKT payout of free response market'
    )

  const totalPool = _.sum(Object.values(pool))
  const probTotal = _.sum(Object.values(resolutions))

  const weightedShareTotal = _.sumBy(Object.keys(resolutions), (outcome) => {
    const prob = resolutions[outcome] / probTotal
    return prob * totalShares[outcome]
  })

  const { outcome, amount, shares } = bet

  const betP = (resolutions[outcome] ?? 0) / probTotal
  const winnings = ((betP * shares) / weightedShareTotal) * totalPool

  return deductDpmFees(amount, winnings)
}

function calculateBinaryMktDpmPayout(
  contract: FullContract<DPM, Binary>,
  bet: Bet
) {
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

export function resolvedDpmPayout(contract: FullContract<DPM, any>, bet: Bet) {
  if (contract.resolution)
    return calculateDpmPayout(contract, bet, contract.resolution)
  throw new Error('Contract was not resolved')
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
