import { unauthedApi } from 'common/util/api'
import { APIParams } from 'common/api/schema'
import { groupBy, maxBy, minBy, sortBy, uniqBy } from 'lodash'
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
// The most bets one bet-points request returns. The endpoint returns a random
// sample when a window holds more, so a response this long may be missing bets.
const BET_POINTS_REQUEST_LIMIT = 5000

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
) =>
  (await getBetPointsAndLatestBetTime(contract, options, getAnswerProbAtStart))
    .points

// The same points, with the time of the latest bet among the rows they were
// made from (undefined if there were none).
//
// The endpoint and the CDN in front of it both reuse responses, so what comes
// back can be older than the market's latest bets. It only vouches for the
// time up to its own last row. For a multiple choice market the rows have no
// hole before that row either: see getSplitBetPoints.
export const getBetPointsAndLatestBetTime = async (
  contract: MarketContract,
  options: Omit<APIParams<'bet-points'>, 'contractId'>,
  getAnswerProbAtStart?: AnswerProbAtStart
) => {
  const { rows, complete } = await getSplitBetPoints(
    contract.id,
    options,
    // Only multiple choice charts reason from which bets are absent.
    isMultiCpmm(contract)
  )
  return {
    points: getPointsFromBetRows(
      contract,
      rows,
      { ...options, complete },
      getAnswerProbAtStart
    ),
    latestBetTime: maxBy(rows, (r) => r.createdTime)?.createdTime,
  }
}

type BetPointRow = Pick<
  Bet,
  'createdTime' | 'probBefore' | 'probAfter' | 'answerId'
>

// Whether the rows are sure to hold every bet the contract knows of since the
// window opened. If so, an answer with no row has not moved in that time.
//
// They must not be a sample. And they must not be older than the contract:
// the endpoint and the CDN in front of it reuse responses, so the rows can
// date from before the market's last bet. If that bet was made after the
// window opened, it has to be among them. (In a window that ends before it,
// it cannot be: such a window is a look at the past.)
const holdsEveryKnownBet = (
  contract: MarketContract,
  rows: BetPointRow[],
  window: { afterTime: number; complete: boolean }
) => {
  if (!window.complete) return false
  const { lastBetTime } = contract
  // No bet yet, or none since the window opened: nothing to be missing.
  if (lastBetTime === undefined || lastBetTime <= window.afterTime) return true
  return rows.some((r) => r.createdTime >= lastBetTime)
}

// Where an answer's line starts when the window's rows hold no bet on it.
// Undefined: not known, so the line gets no starting point.
const getStartProbWithoutBets = (
  contract: MultiContract,
  answer: Answer,
  window: { afterTime: number; holdsEveryKnownBet: boolean },
  getAnswerProbAtStart: AnswerProbAtStart | undefined
) => {
  // The window opened before the answer existed, so the line starts where the
  // answer did. That holds whatever the rows contain.
  if (window.afterTime <= answer.createdTime) {
    const opening = getInitialAnswerProbability(contract, answer)
    if (opening !== undefined) return opening
  }
  // Every bet the market has seen since the window opened is in the rows, and
  // none is on this answer. So nothing has moved it since the window opened,
  // and it is still where its pool puts it now. (The pool, not a resolution:
  // the chart draws an answer's resolution as its own point.)
  if (window.holdsEveryKnownBet) {
    const prob = getCpmmProbability(
      { YES: answer.poolYes, NO: answer.poolNo },
      answerP(answer)
    )
    if (Number.isFinite(prob)) return prob
  }
  // Otherwise only earlier history can say, if the caller has it.
  const known = getAnswerProbAtStart?.(answer.id)
  if (known !== undefined && Number.isFinite(known)) return known
  return undefined
}

// Turns the bets of a window into chart points: where each line starts, then
// the probability after each bet. `complete` says whether `rows` holds every
// bet of the window, or may be a sample of them.
export const getPointsFromBetRows = (
  contract: MarketContract,
  rows: BetPointRow[],
  options: { afterTime: number; beforeTime: number; complete: boolean },
  getAnswerProbAtStart?: AnswerProbAtStart
) => {
  const sorted = sortBy(rows, 'createdTime')

  const startingProbs = []
  if (isMultiCpmm(contract)) {
    const { answers } = contract
    const rawPointsByAns = groupBy(rows, 'answerId')
    const holdsKnownBets = holdsEveryKnownBet(contract, rows, options)

    const beforePoints = filterDefined(
      answers.map((ans) => {
        const earliestBet = minBy(rawPointsByAns[ans.id], (b) => b.createdTime)
        const y = earliestBet
          ? earliestBet.probBefore
          : getStartProbWithoutBets(
              contract,
              ans,
              {
                afterTime: options.afterTime,
                holdsEveryKnownBet: holdsKnownBets,
              },
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

// Fetches the bets of a window. A long window is asked for in two parts: the
// part up to an hour boundary some hours back, which everyone looking at the
// market in that hour asks for with the same request, and the part since.
//
// `chained`: the recent part is asked for once the settled part is in, and
// starts from the last bet the settled part holds. The two then join on a bet
// both return, so the rows have no hole between them whatever the age of each
// response: a settled part that was answered from an old copy just ends
// earlier, and the recent part makes up the difference.
//
// Otherwise the two are asked for at once and join on the hour. That is
// quicker, and takes it on trust that the settled part runs up to the hour.
const getSplitBetPoints = async (
  contractId: string,
  options: Omit<APIParams<'bet-points'>, 'contractId'>,
  chained: boolean
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

  const settledOptions = { ...options, beforeTime: splitTime }
  if (!chained) {
    const [settled, recent] = await Promise.all([
      fetchBetPoints(contractId, settledOptions),
      // Both ends of a request are exclusive, so a bet made on the split
      // itself would be in neither half. The recent half starts a millisecond
      // early to take it; a bet that lands in both is dropped as a duplicate.
      fetchBetPoints(contractId, { ...options, afterTime: splitTime - 1 }),
    ])
    return joinParts(settled, recent)
  }

  const settled = await fetchBetPoints(contractId, settledOptions)
  const lastSettledBetTime = maxBy(
    settled.rows,
    (r) => r.createdTime
  )?.createdTime
  const recent = await fetchBetPoints(contractId, {
    ...options,
    // A millisecond before that bet, so that it and any other row of its
    // millisecond come back again (both ends of a request are exclusive).
    // With no bet in the settled part, the whole window.
    afterTime:
      lastSettledBetTime === undefined
        ? afterTime
        : Math.max(afterTime, lastSettledBetTime - 1),
  })
  return joinParts(settled, recent)
}

type FetchedBetPoints = Awaited<ReturnType<typeof fetchBetPoints>>
const joinParts = (settled: FetchedBetPoints, recent: FetchedBetPoints) => ({
  rows: [...settled.rows, ...recent.rows],
  complete: settled.complete && recent.complete,
})

const fetchBetPoints = async (
  contractId: string,
  options: Omit<APIParams<'bet-points'>, 'contractId'>
) => {
  const limit = options.limit ?? BET_POINTS_REQUEST_LIMIT
  const rows = await unauthedApi('bet-points', {
    ...options,
    limit,
    contractId,
  })
  // A response as long as the limit may have been cut off by it.
  return { rows, complete: rows.length < limit }
}
