import { orderBy } from 'lodash'
import { Answer } from './answer'
import { getAnswerProbability } from './calculate'
import { MultiContract } from './contract'

// Pure helpers for the multiple choice market chart.

export const MAX_DEFAULT_GRAPHED_ANSWERS = 6

// The answers the chart draws until the user picks their own: the likeliest
// ones, whatever order the answer list is sorted in. Ties keep creation order.
export const getDefaultGraphedAnswerIds = (
  contract: MultiContract,
  // The answers to choose from: all of them, or the ones a search matched.
  candidates: Answer[]
) =>
  orderBy(
    candidates,
    [
      (a) => {
        const prob = getAnswerProbability(contract, a.id)
        return Number.isFinite(prob) ? prob : -1
      },
      (a) => a.index,
    ],
    ['desc', 'asc']
  )
    .slice(0, MAX_DEFAULT_GRAPHED_ANSWERS)
    .map((a) => a.id)

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
