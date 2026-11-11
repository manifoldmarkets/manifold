import { unauthedApi } from 'common/util/api'
import { APIParams } from 'common/api/schema'
import { groupBy, minBy, sortBy, uniqBy } from 'lodash'
import { buildArray, filterDefined } from 'common/util/array'
import { HOUR_MS } from 'common/util/time'
import { Answer, answerP } from './answer'
import { Bet } from './bet'
import { getInitialAnswerProbability } from './calculate'
import { getCpmmProbability } from './calculate-cpmm'
import { isMultiCpmm, MarketContract, MultiContract } from './contract'

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

// A multiple choice answer's probability at the start of a window, if the
// caller has earlier history to read it from. See getPointsFromBetRows.
export type AnswerProbAtStart = (answerId: string) => number | undefined

// gets random bets - 50,000 by default
export const getBetPointsBetween = async (
  contract: MarketContract,
  options: Omit<APIParams<'bet-points'>, 'contractId'>,
  getAnswerProbAtStart?: AnswerProbAtStart
) => {
  const data = await getSplitBetPoints(contract.id, options)
  return getPointsFromBetRows(contract, data, options, getAnswerProbAtStart)
}

type BetPointRow = Pick<
  Bet,
  'createdTime' | 'probBefore' | 'probAfter' | 'answerId'
>

// Where an answer's line starts when it has no bet in the window. Its
// probability did not move during the window, so the line is flat at whatever
// it was when the window opened. Undefined: not known, so draw no line.
const getStartProbWithoutBets = (
  contract: MultiContract,
  answer: Answer,
  afterTime: number,
  reachesLastBet: boolean,
  getAnswerProbAtStart: AnswerProbAtStart | undefined
) => {
  // The window runs up to the market's last bet, so nothing has traded on it
  // since the window opened and it is still where it is now. That is the
  // pool's probability, not a resolution's: the chart draws the resolution as
  // its own last point.
  if (reachesLastBet) {
    const prob = getCpmmProbability(
      { YES: answer.poolYes, NO: answer.poolNo },
      answerP(answer)
    )
    if (Number.isFinite(prob)) return prob
  }
  // Later bets may have moved it since, so only earlier history can say.
  const known = getAnswerProbAtStart?.(answer.id)
  if (known !== undefined && Number.isFinite(known)) return known
  // The window opened before the answer existed: it starts where the answer
  // did, if that is on record.
  if (afterTime <= answer.createdTime)
    return getInitialAnswerProbability(contract, answer)
  return undefined
}

// Turns the bets of a window into chart points: where each line starts, then
// the probability after each bet. `rows` may be a sample of the window's bets.
export const getPointsFromBetRows = (
  contract: MarketContract,
  rows: BetPointRow[],
  options: { afterTime: number; beforeTime: number },
  getAnswerProbAtStart?: AnswerProbAtStart
) => {
  const sorted = sortBy(rows, 'createdTime')

  const startingProbs = []
  if (isMultiCpmm(contract)) {
    const { answers } = contract
    const rawPointsByAns = groupBy(rows, 'answerId')
    const reachesLastBet =
      options.beforeTime > (contract.lastBetTime ?? contract.createdTime)

    const beforePoints = filterDefined(
      answers.map((ans) => {
        const earliestBet = minBy(rawPointsByAns[ans.id], (b) => b.createdTime)
        const y = earliestBet
          ? earliestBet.probBefore
          : getStartProbWithoutBets(
              contract,
              ans,
              options.afterTime,
              reachesLastBet,
              getAnswerProbAtStart
            )
        if (y === undefined) return undefined
        return {
          x: Math.max(ans.createdTime, options.afterTime),
          y,
          answerId: ans.id,
        }
      })
    )
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
  const recentTailStart = Math.max(
    afterTime,
    beforeTime - RECENT_BET_POINTS_WINDOW_MS
  )
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
