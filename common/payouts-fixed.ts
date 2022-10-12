import { Bet } from './bet'
import { getProbability } from './calculate'
import { getCpmmLiquidityPoolWeights } from './calculate-cpmm'
import { CPMMContract } from './contract'
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
    .filter((b) => !b.isAnte && !b.isLiquidityProvision)
    .map((bet) => ({
      userId: bet.userId,
      payout: bet.amount,
    }))

  const creatorPayout = 0

  return { payouts, creatorPayout, liquidityPayouts, collectedFees: noFees }
}

export const getStandardFixedPayouts = (
  outcome: string,
  contract: CPMMContract,
  bets: Bet[],
  liquidities: LiquidityProvision[]
) => {
  const winningBets = bets.filter((bet) => bet.outcome === outcome)

  const payouts = winningBets.map(({ userId, shares }) => ({
    userId,
    payout: shares,
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
  contract: CPMMContract,
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
  contract: CPMMContract,
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutionProbability?: number
) => {
  const p =
    resolutionProbability === undefined
      ? getProbability(contract)
      : resolutionProbability

  const payouts = bets.map(({ userId, outcome, shares }) => {
    const betP = outcome === 'YES' ? p : 1 - p
    return { userId, payout: betP * shares }
  })

  const { collectedFees } = contract
  const creatorPayout = collectedFees.creatorFee
  const liquidityPayouts = getLiquidityPoolProbPayouts(contract, p, liquidities)

  return { payouts, creatorPayout, liquidityPayouts, collectedFees }
}

export const getLiquidityPoolProbPayouts = (
  contract: CPMMContract,
  p: number,
  liquidities: LiquidityProvision[]
) => {
  const { pool, subsidyPool } = contract
  const finalPool = p * pool.YES + (1 - p) * pool.NO + (subsidyPool ?? 0)
  if (finalPool < 1e-3) return []

  const weights = getCpmmLiquidityPoolWeights(liquidities)

  return Object.entries(weights).map(([providerId, weight]) => ({
    userId: providerId,
    payout: weight * finalPool,
  }))
}
