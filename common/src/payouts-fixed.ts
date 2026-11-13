import { sumBy } from 'lodash'
import { Answer } from './answer'
import { getCpmmLiquidityPoolWeights } from './calculate-cpmm'
import { CPMMContract } from './contract'
import { ContractMetric } from './contract-metric'
import { LiquidityProvision } from './liquidity-provision'
import { PayoutInfo } from './payouts'

export const getFixedCancelPayouts = (
  contractMetrics: ContractMetric[],
  liquidities: LiquidityProvision[]
): PayoutInfo => {
  const traderPayouts = contractMetrics.map((metric) => {
    const payout =
      (metric.totalAmountInvested ?? 0) - (metric.totalAmountSold ?? 0)
    return {
      userId: metric.userId,
      payout,
    }
  })

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

// The mana an answer of an independent multiple choice market holds for its
// traders and liquidity providers, counted from its shares. Each mana that
// came in (a bet, an ante, a subsidy) put one YES and one NO share into the
// pool or a trader's hands, or fewer where an add threw shares of one side
// away to hold the price (cpmm-multi-1's subsidies and custom starting odds).
// Each mana that went back out (a sale, a redemption) took one of each with
// it. So neither the YES nor the NO shares outstanding number more than the
// mana the answer holds, and the larger of the two counts it most closely:
// short by the smaller of what the two sides have thrown away, so exactly on
// an answer that has only ever been cpmm-multi-2, which discards nothing.
// Subsidy still pending is mana too: the answer's own, and its share of the
// market's.
//
// A YES resolution pays out the YES shares and the pending subsidy, and a NO
// resolution the NO shares and the pending subsidy, so this is also the most
// the answer pays out when it resolves YES, NO or to a probability. Like
// those payouts, it takes the positions' recorded shares as they are.
export const getIndependentMultiAnswerBacking = (
  answer: Answer,
  answerMetrics: ContractMetric[],
  contractSubsidyPoolShare: number
) => {
  const yesShares =
    answer.poolYes + sumBy(answerMetrics, (m) => m.totalShares?.YES ?? 0)
  const noShares =
    answer.poolNo + sumBy(answerMetrics, (m) => m.totalShares?.NO ?? 0)
  return (
    Math.max(yesShares, noShares) +
    (answer.subsidyPool ?? 0) +
    (contractSubsidyPoolShare ?? 0)
  )
}

// Rounding allowed when comparing what a cancelled answer holds with what it
// refunds, as a fraction of the amounts compared. Both are sums over every
// position in the answer, equal on paper whenever every answer was open for
// every subsidy, so the comparison must not turn on their last few bits.
const CANCEL_BACKING_TOLERANCE = 1e-9

// A cancelled answer of an independent multiple choice market refunds its
// traders what they put in and its liquidity providers what they did, out of
// what it holds (getIndependentMultiAnswerBacking) and no more.
//
// Provisions made to the answer itself went into its pool or its pending
// subsidy in full, and are refunded in full: its ante, a subsidy for this
// answer, and its share of a whole-market provision that records the answers
// it was split among (`answerLiquidities` carries all three).
//
// A whole-market provision that records no answers went into the market's
// pending pool, which the drizzle moved into whichever answers were open at
// each tick. What an answer holds of one can only be estimated, and it is
// refunded out of what the answer holds beyond the refunds above:
//
// - `sharedLiquidities` carries each such provision at its estimated share
//   (getIndependentMultiFixedPayouts). They are refunded first, each scaled
//   alike if the answer holds less than they come to. Such a provision used
//   to be refunded at amount / number of answers by every cancelled answer,
//   whatever it had received: an answer listed after a subsidy had drizzled
//   into the others refunded mana it never had, while the others paid the
//   subsidy out too.
// - `furtherLiquidities` carries the same provisions at how much more of
//   each the answer can be holding: more than the estimate, or some of one
//   it is estimated to hold none of (listed while the pool was still
//   draining). What the answer holds beyond the estimates is theirs, and
//   goes back to them in proportion, none getting more than it put in. Left
//   in a cancelled answer it would be nobody's.
//
// So a cancellation never refunds mana the answer doesn't hold, whatever the
// provisions record, and leaves none behind that a provision can account for.
//
// The traders' and the answer's own provisions' refunds are what they were:
// what each put in. (On an answer traded while fees were charged, that
// already came to more than the answer holds, by the fees that left the
// market. The whole-market provisions go without first.)
//
// A cpmm-multi-1 answer that has thrown away shares of both sides (subsidies
// that reached it on both sides of 50%, or custom starting odds and a subsidy
// on the other side) is counted short by the smaller of the two, and refunds
// that much less.
export const getIndependentMultiCancelPayouts = (
  answer: Answer,
  contractMetrics: ContractMetric[],
  answerLiquidities: LiquidityProvision[],
  sharedLiquidities: LiquidityProvision[],
  contractSubsidyPoolShare: number,
  furtherLiquidities: LiquidityProvision[] = []
): PayoutInfo => {
  const answerMetrics = contractMetrics.filter(
    (metric) => metric.answerId === answer.id
  )
  const { traderPayouts, liquidityPayouts: answerLiquidityPayouts } =
    getFixedCancelPayouts(answerMetrics, answerLiquidities)

  const backing = getIndependentMultiAnswerBacking(
    answer,
    answerMetrics,
    contractSubsidyPoolShare
  )
  const otherRefunds =
    sumBy(traderPayouts, (p) => p.payout) +
    sumBy(answerLiquidityPayouts, (p) => p.payout)
  // What's left for the whole-market provisions.
  const available = Math.max(backing - otherRefunds, 0)
  const tolerance =
    CANCEL_BACKING_TOLERANCE * (Math.abs(backing) + Math.abs(otherRefunds))
  // A pool or a position that isn't a number vouches for nothing, and every
  // comparison with it is false: refund none of these provisions rather than
  // all of them.
  const counted = Number.isFinite(backing) && Number.isFinite(otherRefunds)

  const sharedRefund = sumBy(sharedLiquidities, (l) => l.amount)
  // Only provisions are scaled down. A withdrawal recorded against the whole
  // market (a negative amount) is still charged in full.
  const sharedProvided = sumBy(sharedLiquidities, (l) => Math.max(l.amount, 0))
  const sharedWithdrawn = sharedRefund - sharedProvided

  let scale = 1
  if (!counted) {
    scale = 0
  } else if (sharedRefund > available + tolerance && sharedProvided > 0) {
    scale = Math.min(
      1,
      Math.max(0, (available - sharedWithdrawn) / sharedProvided)
    )
  }
  const sharedLiquidityPayouts = sharedLiquidities.map((liquidity) => ({
    userId: liquidity.userId,
    payout: liquidity.amount > 0 ? liquidity.amount * scale : liquidity.amount,
  }))

  // What the answer holds beyond the shares, to the provisions that can have
  // put it there.
  const beyondShares = counted && scale === 1 ? available - sharedRefund : 0
  const further = furtherLiquidities.filter(
    (l) => Number.isFinite(l.amount) && l.amount > 0
  )
  const furtherRoom = sumBy(further, (l) => l.amount)
  const furtherScale =
    beyondShares > tolerance && furtherRoom > 0
      ? Math.min(beyondShares, furtherRoom) / furtherRoom
      : 0
  const furtherLiquidityPayouts =
    furtherScale > 0
      ? further.map((liquidity) => ({
          userId: liquidity.userId,
          payout: liquidity.amount * furtherScale,
        }))
      : []

  return {
    traderPayouts,
    liquidityPayouts: answerLiquidityPayouts.concat(
      sharedLiquidityPayouts,
      furtherLiquidityPayouts
    ),
    ...(scale < 1
      ? { withheldLiquidityRefund: sharedProvided * (1 - scale) }
      : {}),
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
  liquidities: LiquidityProvision[],
  contractSubsidyPool: number
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
    liquidities,
    contractSubsidyPool
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
  liquidities: LiquidityProvision[],
  contractSubsidyPoolShare: number
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
    liquidities,
    contractSubsidyPoolShare
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
  liquidities: LiquidityProvision[],
  contractSubsidyPoolShare: number
) => {
  const poolPayout =
    resolution * answer.poolYes + (1 - resolution) * answer.poolNo
  // Include undrizzled subsidy pools: answer's own + share of contract's
  const payout =
    poolPayout + (answer.subsidyPool ?? 0) + (contractSubsidyPoolShare ?? 0)
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
  liquidities: LiquidityProvision[],
  contractSubsidyPool: number
) => {
  const poolPayout = sumBy(answers, (answer) => {
    const weight = resolutions[answer.id] ?? 0
    const { poolYes, poolNo } = answer
    return weight * poolYes + (1 - weight) * poolNo
  })
  // Include undrizzled subsidy pools, like binary markets do
  const answerSubsidyPools = sumBy(answers, (a) => a.subsidyPool ?? 0)
  const totalPayout = poolPayout + contractSubsidyPool + answerSubsidyPools
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
  resolutionProbability: number,
  contractSubsidyPoolShare: number
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
    liquidities,
    contractSubsidyPoolShare
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
