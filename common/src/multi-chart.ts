import { orderBy } from 'lodash'
import { Answer } from './answer'
import { getAnswerProbability } from './calculate'
import { MultiPoints } from './chart'
import { MultiContract } from './contract'

// Pure helpers for the multiple choice market chart.

export const MAX_DEFAULT_GRAPHED_ANSWERS = 6

// How far ahead in probability an answer must be to take the place of one
// already on the chart. Without it, two answers trading places at the edge
// would swap lines on the chart with every bet.
const GRAPHED_ANSWER_STICKINESS = 0.01

type RankedAnswer = { id: string; index: number; payout: number; prob: number }

// A payout always outranks no payout, and a larger one a smaller one. Between
// equal payouts it takes a probability higher by more than the margin.
const clearlyOutranks = (a: RankedAnswer, b: RankedAnswer) =>
  a.payout > b.payout ||
  (a.payout === b.payout && a.prob > b.prob + GRAPHED_ANSWER_STICKINESS)

// The answers the chart draws until the user picks their own: the likeliest
// ones, whatever order the answer list is sorted in. In a market that has
// resolved to its answers, the ones that paid out come first, by share.
//
// `current` is what the chart is drawing now. An answer keeps its place until
// one that is not drawn clearly outranks it.
export const getDefaultGraphedAnswerIds = (
  contract: MultiContract,
  // The answers to choose from: all of them, or the ones a search matched.
  candidates: Answer[],
  current: string[] = []
) => {
  const { resolutions } = contract
  const ranked: RankedAnswer[] = orderBy(
    candidates.map((a) => {
      const prob = getAnswerProbability(contract, a.id)
      return {
        id: a.id,
        index: a.index,
        payout: resolutions ? resolutions[a.id] ?? 0 : 0,
        prob: Number.isFinite(prob) ? prob : -1,
      }
    }),
    ['payout', 'prob', 'index'],
    ['desc', 'desc', 'asc']
  )

  // Start from the answers already drawn, topped up with the best of the rest.
  const chosen = new Set(
    ranked
      .filter((a) => current.includes(a.id))
      .slice(0, MAX_DEFAULT_GRAPHED_ANSWERS)
      .map((a) => a.id)
  )
  for (const a of ranked) {
    if (chosen.size >= MAX_DEFAULT_GRAPHED_ANSWERS) break
    chosen.add(a.id)
  }
  // Then the best answer not drawn takes the place of the weakest one drawn,
  // for as long as it clearly outranks it. Each swap improves the set, so
  // this ends.
  for (;;) {
    const drawn = ranked.filter((a) => chosen.has(a.id))
    const weakest = drawn[drawn.length - 1]
    const challenger = ranked.find((a) => !chosen.has(a.id))
    if (!weakest || !challenger || !clearlyOutranks(challenger, weakest)) break
    chosen.delete(weakest.id)
    chosen.add(challenger.id)
  }
  return ranked.filter((a) => chosen.has(a.id)).map((a) => a.id)
}

// The value of a step line at time t: the y of its last point at or before t.
// Undefined if the line has not started by then. `points` must be sorted by x.
export const getStepValueAt = (
  points: { x: number; y: number }[] | undefined,
  t: number
) => {
  if (!points || points.length === 0 || points[0].x > t) return undefined
  let lo = 0
  let hi = points.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (points[mid].x <= t) lo = mid
    else hi = mid - 1
  }
  return points[lo].y
}

// Lines, and the time up to which they are known to hold every move.
export type CoveredMultiPoints = {
  points: MultiPoints
  coveredUntil: number | undefined
}

// Where an answer's line stood at time t, read from the first history that
// covers t and has the answer's line by then. Undefined if none does: a
// history says nothing about a time it does not cover.
export const getKnownStepValueAt = (
  histories: CoveredMultiPoints[],
  answerId: string,
  t: number
) => {
  for (const { points, coveredUntil } of histories) {
    if (coveredUntil === undefined || t > coveredUntil) continue
    const value = getStepValueAt(points[answerId], t)
    if (value !== undefined) return value
  }
  return undefined
}

// The time up to which a fetch of the bets between `min` and `max` (both ends
// exclusive) holds the market's whole history: its last bet, as known when the
// fetch was sent. Undefined unless the fetch runs from before the market opened
// to past that bet.
//
// However far `max` reaches, nothing after that bet counts: a bet made once
// the fetch was on its way may have missed the response.
export const getWholeHistoryCoverage = (
  fetched: { min: number; max: number },
  createdTime: number,
  lastBetTime: number
) =>
  fetched.min < createdTime && fetched.max > lastBetTime
    ? lastBetTime
    : undefined

// The probability axis fitted to lines that run from `min` to `max`, snapped
// outward to gridlines 1 / `gridlinesPerUnit` apart.
export const getFittedProbDomain = (
  min: number,
  max: number,
  gridlinesPerUnit: number
): [number, number] => {
  // Nothing to fit to, for instance a past window in which no graphed answer
  // has a line: show the whole range rather than a broken axis.
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]

  const step = 1 / gridlinesPerUnit
  const lowest = Math.floor(min * gridlinesPerUnit) / gridlinesPerUnit
  const highest = Math.ceil(max * gridlinesPerUnit) / gridlinesPerUnit
  // A flat line on a gridline (an untouched answer at exactly 50%) would give
  // the axis no height. Open it by a step each way.
  if (lowest === highest)
    return [Math.max(0, lowest - step), Math.min(1, highest + step)]
  return [lowest, highest]
}
