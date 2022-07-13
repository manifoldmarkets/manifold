import { cloneDeep, range, sum, sumBy, sortBy, mapValues } from 'lodash'
import { Bet, NumericBet } from './bet'
import { DPMContract, DPMBinaryContract, NumericContract } from './contract'
import { DPM_FEES } from './fees'
import { normpdf } from './util/math'
import { addObjects } from './util/object'

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

export function getNumericBets(
  contract: NumericContract,
  bucket: string,
  betAmount: number,
  variance: number
) {
  const { bucketCount } = contract
  const bucketNumber = parseInt(bucket)
  const buckets = range(0, bucketCount)

  const mean = bucketNumber / bucketCount

  const allDensities = buckets.map((i) =>
    normpdf(i / bucketCount, mean, variance)
  )
  const densitySum = sum(allDensities)

  const rawBetAmounts = allDensities
    .map((d) => (d / densitySum) * betAmount)
    .map((x) => (x >= 1 / bucketCount ? x : 0))

  const rawSum = sum(rawBetAmounts)
  const scaledBetAmounts = rawBetAmounts.map((x) => (x / rawSum) * betAmount)

  const bets = scaledBetAmounts
    .map((x, i) => (x > 0 ? [i.toString(), x] : undefined))
    .filter((x) => x != undefined) as [string, number][]

  return bets
}

export const getMappedBucket = (value: number, contract: NumericContract) => {
  const { bucketCount, min, max } = contract

  const index = Math.floor(((value - min) / (max - min)) * bucketCount)
  const bucket = Math.max(Math.min(index, bucketCount - 1), 0)

  return `${bucket}`
}

export const getValueFromBucket = (
  bucket: string,
  contract: NumericContract
) => {
  const { bucketCount, min, max } = contract
  const index = parseInt(bucket)
  const value = min + (index / bucketCount) * (max - min)
  const rounded = Math.round(value * 1e4) / 1e4
  return rounded
}

export const getExpectedValue = (contract: NumericContract) => {
  const { bucketCount, min, max, totalShares } = contract

  const totalShareSum = sumBy(
    Object.values(totalShares),
    (shares) => shares ** 2
  )
  const probs = range(0, bucketCount).map(
    (i) => totalShares[i] ** 2 / totalShareSum
  )

  const values = range(0, bucketCount).map(
    (i) =>
      // use mid point within bucket
      0.5 * (min + (i / bucketCount) * (max - min)) +
      0.5 * (min + ((i + 1) / bucketCount) * (max - min))
  )

  const weightedValues = range(0, bucketCount).map((i) => probs[i] * values[i])

  const expectation = sum(weightedValues)
  const rounded = Math.round(expectation * 1e2) / 1e2
  return rounded
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

export function calculateNumericDpmShares(
  totalShares: {
    [outcome: string]: number
  },
  bets: [string, number][]
) {
  const shares: number[] = []

  totalShares = cloneDeep(totalShares)

  const order = sortBy(
    bets.map(([, amount], i) => [amount, i]),
    ([amount]) => amount
  ).map(([, i]) => i)

  for (const i of order) {
    const [bucket, bet] = bets[i]
    shares[i] = calculateDpmShares(totalShares, bet, bucket)
    totalShares = addObjects(totalShares, { [bucket]: shares[i] })
  }

  return { shares, totalShares }
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

export function calculateDpmCancelPayout(contract: DPMContract, bet: Bet) {
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

  const { totalShares, pool, resolutions, outcomeType } = contract

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

  const poolFrac =
    outcomeType === 'NUMERIC'
      ? sumBy(
          Object.keys((bet as NumericBet).allOutcomeShares ?? {}),
          (outcome) => {
            return (
              (probs[outcome] * (bet as NumericBet).allOutcomeShares[outcome]) /
              totalShares[outcome]
            )
          }
        )
      : (probs[outcome] * shares) / totalShares[outcome]

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

export function resolvedDpmPayout(contract: DPMContract, bet: Bet) {
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
