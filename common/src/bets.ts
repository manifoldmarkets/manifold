import { unauthedApi } from 'common/util/api'
import { APIParams } from 'common/api/schema'
import { groupBy, minBy, sortBy, uniqBy } from 'lodash'
import { buildArray } from 'common/util/array'
import { HOUR_MS } from 'common/util/time'
import { getInitialAnswerProbability } from './calculate'
import { MarketContract } from './contract'

export async function getTotalBetCount(contractId: string) {
  const res = (await unauthedApi('bets', {
    contractId,
    count: true,
    filterRedemptions: true,
  })) as any as { count: number }[]
  return res[0].count
}

const RECENT_BET_POINTS_WINDOW_MS = 6 * HOUR_MS
const SPLIT_QUERY_MIN_SPAN_MS = 6 * HOUR_MS

// gets random bets - 50,000 by default
export const getBetPoints = async (
  contractId: string,
  options?: APIParams<'bets'>
) => {
  const data = await unauthedApi('bets', {
    contractId,
    points: true,
    limit: 50000,
    ...options,
  })

  const sorted = sortBy(data, 'createdTime')

  if (sorted.length === 0) return []

  // we need to include previous prob for binary in case the prob shifted from something
  const includePrevProb = !!options?.afterTime && !sorted[0].answerId

  return buildArray(
    includePrevProb && {
      x: sorted[0].createdTime - 1,
      y: sorted[0].probBefore,
      answerId: sorted[0].answerId,
    },
    sorted.map((r) => ({
      x: r.createdTime,
      y: r.probAfter,
      answerId: r.answerId,
    }))
  )
}

// gets random bets - 50,000 by default
export const getBetPointsBetween = async (
  contract: MarketContract,
  options: Omit<APIParams<'bet-points'>, 'contractId'>
) => {
  const data = await getSplitBetPoints(contract.id, options)

  const sorted = sortBy(data, 'createdTime')

  const startingProbs = []
  if (contract.mechanism === 'cpmm-multi-1') {
    const { answers } = contract
    const rawPointsByAns = groupBy(data, 'answerId')

    const beforePoints = answers.map((ans) => {
      const earliestBet = minBy(rawPointsByAns[ans.id], (b) => b.createdTime)
      return {
        x: Math.max(ans.createdTime, options.afterTime),
        y:
          earliestBet?.probBefore ??
          getInitialAnswerProbability(contract, ans) ??
          0,
        answerId: ans.id,
      }
    })
    startingProbs.push(...beforePoints)
  } else {
    if (sorted.length === 0)
      return buildArray(
        options.afterTime === contract.createdTime && {
          x: contract.createdTime,
          y: contract.initialProbability ?? 0.5,
          answerId: undefined,
        }
      )
    startingProbs.push({
      x: options.afterTime ?? contract.createdTime,
      y: sorted[0].probBefore,
      answerId: sorted[0].answerId,
    })
  }

  const endPoints = uniqBy(
    [
      ...startingProbs,
      ...sorted.map((r) => ({
        x: r.createdTime,
        y: r.probAfter,
        answerId: r.answerId,
      })),
    ],
    (p) => p.x + p.y + (p.answerId ?? '')
  )
  return endPoints
}

const getSplitBetPoints = async (
  contractId: string,
  options: Omit<APIParams<'bet-points'>, 'contractId'>
) => {
  const { afterTime, beforeTime } = options
  const span = beforeTime - afterTime
  if (span <= SPLIT_QUERY_MIN_SPAN_MS) {
    return await fetchBetPoints(contractId, options)
  }

  // Keep a small recent tail uncached/fresh while making the long history chunk
  // stable within each hour for better cache hit rates.
  const recentTailStart = Math.max(afterTime, beforeTime - RECENT_BET_POINTS_WINDOW_MS)
  const splitTime = Math.floor(recentTailStart / HOUR_MS) * HOUR_MS
  if (splitTime <= afterTime || splitTime >= beforeTime) {
    return await fetchBetPoints(contractId, options)
  }

  const [historicalData, recentData] = await Promise.all([
    fetchBetPoints(contractId, {
      ...options,
      beforeTime: splitTime,
    }),
    fetchBetPoints(contractId, {
      ...options,
      afterTime: splitTime,
    }),
  ])
  return [...historicalData, ...recentData]
}

const fetchBetPoints = (
  contractId: string,
  options: Omit<APIParams<'bet-points'>, 'contractId'>
) =>
  unauthedApi('bet-points', {
    ...options,
    contractId,
  })
