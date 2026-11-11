import { orderBy } from 'lodash'
import { Answer } from './answer'
import { getAnswerProbability } from './calculate'
import { MultiContract } from './contract'

// Pure helpers for the multiple choice market chart.

export const MAX_DEFAULT_GRAPHED_ANSWERS = 6

// How far below the last place an answer already on the chart may fall before
// it gives that place up. Without it, two answers trading places at the edge
// would swap lines on the chart with every bet.
const GRAPHED_ANSWER_STICKINESS = 0.01

// The answers the chart draws until the user picks their own: the likeliest
// ones, whatever order the answer list is sorted in. In a market that has
// resolved to its answers, the ones that paid out come first.
//
// `current` is what the chart is drawing now. Those answers keep their place
// unless they have clearly dropped out.
export const getDefaultGraphedAnswerIds = (
  contract: MultiContract,
  // The answers to choose from: all of them, or the ones a search matched.
  candidates: Answer[],
  current: string[] = []
) => {
  const { resolutions } = contract
  // A payout outranks any probability; among equal payouts, the likeliest.
  const score = (a: Answer) => {
    const prob = getAnswerProbability(contract, a.id)
    const payout = resolutions ? (resolutions[a.id] ?? 0) / 100 : 0
    return payout * 10 + (Number.isFinite(prob) ? prob : -1)
  }
  const ranked = orderBy(
    candidates.map((a) => ({ id: a.id, index: a.index, score: score(a) })),
    ['score', 'index'],
    ['desc', 'asc']
  )
  const top = ranked.slice(0, MAX_DEFAULT_GRAPHED_ANSWERS)
  if (top.length === 0) return []

  const cutoff = top[top.length - 1].score - GRAPHED_ANSWER_STICKINESS
  const kept = new Set(
    ranked
      .filter((a) => current.includes(a.id) && a.score >= cutoff)
      .slice(0, MAX_DEFAULT_GRAPHED_ANSWERS)
      .map((a) => a.id)
  )
  const chosen = new Set(kept)
  for (const a of top) {
    if (chosen.size >= MAX_DEFAULT_GRAPHED_ANSWERS) break
    chosen.add(a.id)
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
