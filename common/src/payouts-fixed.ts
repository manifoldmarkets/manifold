import { Answer } from './answer'
import { CPMMContract } from './contract'
import { LiquidityProvision } from './liquidity-provision'
import { PayoutInfo } from './payouts'
import { ContractMetric } from './contract-metric'
import { sumBy } from 'lodash'
import { getCpmmLiquidityPoolWeights } from './calculate-cpmm'

export const getFixedCancelPayouts = (
  contractMetrics: ContractMetric[],
  liquidities: LiquidityProvision[]
): PayoutInfo => {
  const traderPayouts = contractMetrics.map((metric) => ({
    userId: metric.userId,
    payout: metric.invested,
  }))

  const liquidityPayouts = liquidities.map((liquidity) => ({
    userId: liquidity.userId,
    payout: liquidity.amount,
  }))
  // TODO we don't claw back fees from creators here, but we used to when using bets

  return {
    traderPayouts,
    liquidityPayouts,
  }
}

export const getStandardFixedPayouts = (
  outcome: string, // Will be 'YES' or 'NO'
  contract: CPMMContract,
  contractMetrics: ContractMetric[],
  liquidities: LiquidityProvision[]
): PayoutInfo => {
  const traderPayouts = contractMetrics.map((metric) => {
    const shares = metric.totalShares[outcome] || 0
    return {
      userId: metric.userId,
      payout: shares,
    }
  })

  const liquidityPayouts = getLiquidityPoolPayouts(
    contract,
    outcome,
    liquidities
  )

  return {
    traderPayouts,
    liquidityPayouts,
  }
}

export const getMultiFixedPayouts = (
  answers: Answer[],
  resolutions: { [answerId: string]: number },
  contractMetrics: ContractMetric[],
  liquidities: LiquidityProvision[]
): PayoutInfo => {
  const traderPayouts = contractMetrics
    .map((metric) => {
      let payout = 0
      const answer = answers.find((answer) => answer.id === metric.answerId)
      if (!answer) return { userId: metric.userId, payout }
      for (const outcome of ['YES', 'NO']) {
        const weight = resolutions[answer.id] ?? 0
        const outcomeWeight = outcome === 'YES' ? weight : 1 - weight
        const shares = metric.totalShares[outcome] ?? 0
        payout += shares * outcomeWeight
      }
      return {
        userId: metric.userId,
        payout,
      }
    })
    .filter(({ payout }) => payout !== 0)

  const liquidityPayouts = getMultiLiquidityPoolPayouts(
    answers,
    resolutions,
    liquidities
  )

  return {
    traderPayouts,
    liquidityPayouts,
  }
}

export const getIndependentMultiYesNoPayouts = (
  answer: Answer,
  outcome: 'YES' | 'NO',
  contractMetrics: ContractMetric[],
  liquidities: LiquidityProvision[]
): PayoutInfo => {
  const traderPayouts = contractMetrics
    .filter((metric) => metric.answerId === answer.id)
    .map((metric) => {
      const shares = metric.totalShares[outcome] || 0
      return {
        userId: metric.userId,
        payout: shares,
      }
    })
  const resolution = outcome === 'YES' ? 1 : 0

  const liquidityPayouts = getIndependentMultiLiquidityPoolPayouts(
    answer,
    resolution,
    liquidities
  )

  return {
    traderPayouts,
    liquidityPayouts,
  }
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

export const getIndependentMultiLiquidityPoolPayouts = (
  answer: Answer,
  resolution: number,
  liquidities: LiquidityProvision[]
) => {
  const payout = resolution * answer.poolYes + (1 - resolution) * answer.poolNo
  const weightsByUser = getCpmmLiquidityPoolWeights(liquidities)
  return Object.entries(weightsByUser)
    .map(([userId, weight]) => ({
      userId,
      payout: weight * payout,
    }))
    .filter(({ payout }) => payout >= 1e-3)
}

export const getMultiLiquidityPoolPayouts = (
  answers: Answer[],
  resolutions: { [answerId: string]: number },
  liquidities: LiquidityProvision[]
) => {
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
  contract: CPMMContract,
  contractMetrics: ContractMetric[],
  liquidities: LiquidityProvision[],
  resolutionProbability: number
): PayoutInfo => {
  const outcomeProbs = {
    YES: resolutionProbability,
    NO: 1 - resolutionProbability,
  }

  const traderPayouts = contractMetrics.map((metric) => {
    const yesShares = metric.totalShares['YES'] || 0
    const noShares = metric.totalShares['NO'] || 0
    return {
      userId: metric.userId,
      payout: yesShares * outcomeProbs.YES + noShares * outcomeProbs.NO,
    }
  })

  const liquidityPayouts =
    contract.mechanism === 'cpmm-1'
      ? getLiquidityPoolProbPayouts(contract, outcomeProbs, liquidities)
      : []

  return {
    traderPayouts,
    liquidityPayouts,
  }
}

export const getIndependentMultiMktPayouts = (
  answer: Answer,
  contractMetrics: ContractMetric[],
  liquidities: LiquidityProvision[],
  resolutionProbability: number
): PayoutInfo => {
  const outcomeProbs = {
    YES: resolutionProbability,
    NO: 1 - resolutionProbability,
  }
  const traderPayouts = contractMetrics
    .filter((metric) => metric.answerId === answer.id)
    .map((metric) => {
      const yesShares = metric.totalShares['YES'] ?? 0
      const noShares = metric.totalShares['NO'] ?? 0
      return {
        userId: metric.userId,
        payout: yesShares * outcomeProbs.YES + noShares * outcomeProbs.NO,
      }
    })

  const liquidityPayouts = getIndependentMultiLiquidityPoolPayouts(
    answer,
    resolutionProbability,
    liquidities
  )

  return {
    traderPayouts,
    liquidityPayouts,
  }
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
