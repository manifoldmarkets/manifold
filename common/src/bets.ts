import { unauthedApi } from 'common/util/api'
import { APIParams } from 'common/api/schema'
import { groupBy, minBy, sortBy, uniqBy } from 'lodash'
import { buildArray } from 'common/util/array'
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
  const data = await unauthedApi('bet-points', {
    ...options,
    contractId: contract.id,
  })

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
