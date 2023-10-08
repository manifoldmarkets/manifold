import { sumBy } from 'lodash'
import { Bet } from './bet'
import { getCpmmLiquidityPoolWeights } from './calculate-cpmm'
import { CPMMContract, CPMMMultiContract } from './contract'
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
  contract:
    | CPMMContract
    | (CPMMMultiContract & { shouldAnswersSumToOne: false }),
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
  const liquidityPayouts =
    contract.mechanism === 'cpmm-1'
      ? getLiquidityPoolPayouts(contract, outcome, liquidities)
      : []

  return { payouts, creatorPayout, liquidityPayouts, collectedFees }
}

export const getMultiFixedPayouts = (
  contract: CPMMMultiContract,
  resolutions: { [answerId: string]: number },
  bets: Bet[],
  liquidities: LiquidityProvision[]
) => {
  const payouts = bets
    .map(({ userId, shares, answerId, outcome }) => {
      const weight = answerId ? resolutions[answerId] ?? 0 : 0
      const outcomeWeight = outcome === 'YES' ? weight : 1 - weight
      const payout = shares * outcomeWeight
      return {
        userId,
        payout,
      }
    })
    .filter(({ payout }) => payout !== 0)

  const liquidityPayouts = getMultiLiquidityPoolPayouts(
    contract,
    resolutions,
    liquidities
  )

  return { payouts, liquidityPayouts, creatorPayout: 0, collectedFees: noFees }
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

export const getMultiLiquidityPoolPayouts = (
  contract: CPMMMultiContract,
  resolutions: { [answerId: string]: number },
  liquidities: LiquidityProvision[]
) => {
  const { answers } = contract
  const totalPayout = sumBy(answers, (answer) => {
    const weight = resolutions[answer.id] ?? 0
    const { poolYes, poolNo } = answer
    return weight * poolYes + (1 - weight) * poolNo
  })
  const weightsByUser = getCpmmLiquidityPoolWeights(liquidities)
  return Object.entries(weightsByUser)
    .map(([userId, weight]) => ({
      userId,
      payout: weight * totalPayout,
    }))
    .filter(({ payout }) => payout >= 1e-3)
}

export const getMktFixedPayouts = (
  contract:
    | CPMMContract
    | (CPMMMultiContract & { shouldAnswersSumToOne: false }),
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutionProbability: number
) => {
  const { collectedFees } = contract
  const creatorPayout = collectedFees.creatorFee

  const outcomeProbs = {
    YES: resolutionProbability,
    NO: 1 - resolutionProbability,
  }

  const payouts = bets.map(({ userId, outcome, shares }) => {
    const p = outcomeProbs[outcome as 'YES' | 'NO'] ?? 0
    const payout = p * shares
    return { userId, payout }
  })

  const liquidityPayouts =
    contract.mechanism === 'cpmm-1'
      ? getLiquidityPoolProbPayouts(contract, outcomeProbs, liquidities)
      : []

  return { payouts, creatorPayout, liquidityPayouts, collectedFees }
}

export const getLiquidityPoolProbPayouts = (
  contract: CPMMContract,
  outcomeProbs: { [outcome: string]: number },
  liquidities: LiquidityProvision[]
) => {
  const { pool, subsidyPool } = contract

  const weightedPool = sumBy(
    Object.keys(pool),
    (o) => pool[o] * (outcomeProbs[o] ?? 0)
  )
  const finalPool = weightedPool + (subsidyPool ?? 0)
  if (finalPool < 1e-3) return []

  const weights = getCpmmLiquidityPoolWeights(liquidities)

  return Object.entries(weights).map(([providerId, weight]) => ({
    userId: providerId,
    payout: weight * finalPool,
  }))
}
