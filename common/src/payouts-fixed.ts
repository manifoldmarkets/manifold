import { mapValues, sum, sumBy } from 'lodash'
import { Bet } from './bet'
import { getOutcomeProbability, getProbability } from './calculate'
import { getCpmmLiquidityPoolWeights } from './calculate-cpmm'
import { CPMM2Contract, CPMMContract } from './contract'
import { noFees } from './fees'
import { LiquidityProvision } from './liquidity-provision'

export const getFixedCancelPayouts = (
  bets: Bet[],
  liquidities: LiquidityProvision[]
) => {
  const liquidityPayouts = liquidities.map((lp) => ({
    userId: lp.userId,
    payout: lp.amount,
  }))

  const payouts = bets
    .filter((b) => !b.isAnte)
    .map((bet) => ({
      userId: bet.userId,
      payout: bet.amount,
    }))

  const creatorPayout = 0

  return { payouts, creatorPayout, liquidityPayouts, collectedFees: noFees }
}

export const getStandardFixedPayouts = (
  outcome: string,
  contract: CPMMContract | CPMM2Contract,
  bets: Bet[],
  liquidities: LiquidityProvision[]
) => {
  const winningBets = bets.filter(
    (bet) =>
      bet.outcome === outcome ||
      (bet.sharesByOutcome && bet.sharesByOutcome[outcome])
  )

  const payouts = winningBets.map(({ userId, shares, sharesByOutcome }) => ({
    userId,
    payout: sharesByOutcome ? sharesByOutcome[outcome] ?? 0 : shares,
  }))

  const { collectedFees } = contract
  const creatorPayout = collectedFees.creatorFee
  const liquidityPayouts = getLiquidityPoolPayouts(
    contract,
    outcome,
    liquidities
  )

  return { payouts, creatorPayout, liquidityPayouts, collectedFees }
}

export const getLiquidityPoolPayouts = (
  contract: CPMMContract | CPMM2Contract,
  outcome: string,
  liquidities: LiquidityProvision[]
) => {
  const { pool, subsidyPool } = contract
  const finalPool = pool[outcome] + (subsidyPool ?? 0)
  if (finalPool < 1e-3) return []

  const weights = getCpmmLiquidityPoolWeights(liquidities)

  return Object.entries(weights).map(([providerId, weight]) => ({
    userId: providerId,
    payout: weight * finalPool,
  }))
}

export const getMktFixedPayouts = (
  contract: CPMMContract | CPMM2Contract,
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutionProbs?: {
    [outcome: string]: number
  },
  resolutionProbability?: number
) => {
  const { collectedFees, outcomeType } = contract
  const creatorPayout = collectedFees.creatorFee

  const outcomeProbs = (() => {
    if (outcomeType === 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') {
      const p =
        resolutionProbability === undefined
          ? getProbability(contract)
          : resolutionProbability
      return { YES: p, NO: 1 - p }
    }

    if (resolutionProbs) return mapValues(resolutionProbs, (p) => p / 100)
    return mapValues(contract.pool, (_, o) =>
      getOutcomeProbability(contract, o)
    )
  })()

  const payouts = bets.map(({ userId, outcome, shares, sharesByOutcome }) => {
    let payout: number
    if (sharesByOutcome) {
      payout = sum(
        Object.values(
          mapValues(sharesByOutcome, (s, o) => s * (outcomeProbs[o] ?? 0))
        )
      )
    } else {
      const p = outcomeProbs[outcome] ?? 0
      payout = p * shares
    }
    return { userId, payout }
  })

  const liquidityPayouts = getLiquidityPoolProbPayouts(
    contract,
    outcomeProbs,
    liquidities
  )

  return { payouts, creatorPayout, liquidityPayouts, collectedFees }
}

export const getLiquidityPoolProbPayouts = (
  contract: CPMMContract | CPMM2Contract,
  outcomeProbs: { [outcome: string]: number },
  liquidities: LiquidityProvision[]
) => {
  const { pool, subsidyPool } = contract
  const finalPool = sumBy(
    Object.keys(pool),
    (o) => pool[o] * (outcomeProbs[o] ?? 0) + (subsidyPool ?? 0)
  )
  if (finalPool < 1e-3) return []

  const weights = getCpmmLiquidityPoolWeights(liquidities)

  return Object.entries(weights).map(([providerId, weight]) => ({
    userId: providerId,
    payout: weight * finalPool,
  }))
}
