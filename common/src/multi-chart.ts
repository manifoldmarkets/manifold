import { orderBy, sortBy } from 'lodash'
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

// The time up to which a fetch of a market's bets holds its whole history:
// the time of the latest bet that came back, if the fetch started before the
// market opened (`min` is exclusive). Undefined otherwise.
//
// Not the end of the window that was asked for, nor the last bet the page
// knew of when it asked. The endpoint and the CDN in front of it reuse
// responses, so what comes back can be older than either. A response only
// vouches for the time up to its own last row.
export const getWholeHistoryCoverage = (
  fetched: { min: number; latestBetTime: number | undefined },
  createdTime: number
) => (fetched.min < createdTime ? fetched.latestBetTime : undefined)

// Of the whole history kept so far and one just fetched, the one that vouches
// for more of the market's life. A fetch that vouches for nothing, or for
// less than what is kept, changes nothing.
export const widerHistory = (
  kept: CoveredMultiPoints | undefined,
  fetched: CoveredMultiPoints
) =>
  fetched.coveredUntil !== undefined &&
  fetched.coveredUntil >= (kept?.coveredUntil ?? -Infinity)
    ? fetched
    : kept

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

// Whether a bet row moved its answer's probability. In a market whose answers
// sum to one, a trade on one answer moves the others through rows of this
// kind that carry no shares.
export const movedProbability = (bet: {
  answerId?: string
  probBefore: number
  probAfter: number
}) =>
  bet.answerId !== undefined &&
  Number.isFinite(bet.probAfter) &&
  bet.probAfter !== bet.probBefore

const pointKey = (p: { x: number; y: number }) => `${p.x}:${p.y}`

// Adds points to lines, leaving out any point a line already has and keeping
// each line in time order. Lines that gain nothing keep their array, and with
// nothing to add at all the same object comes back, so a chart that memoizes
// on either has nothing to redraw. `lines` must be in time order.
export const addMultiPoints = (
  lines: MultiPoints,
  additions: MultiPoints
): MultiPoints => {
  let result = lines
  for (const answerId of Object.keys(additions)) {
    const added = additions[answerId]
    if (added.length === 0) continue
    const line = lines[answerId] ?? []
    // A point can only repeat one at or after the earliest addition, and the
    // line is in time order, so only its tail needs checking. New bets land
    // at the end of long lines.
    let earliest = Infinity
    for (const p of added) earliest = Math.min(earliest, p.x)
    const seen = new Set<string>()
    for (let i = line.length - 1; i >= 0 && line[i].x >= earliest; i--)
      seen.add(pointKey(line[i]))
    const fresh = added.filter((p) => {
      const key = pointKey(p)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (fresh.length === 0) continue
    const merged = [...line, ...fresh]
    const inOrder = merged.every((p, i) => i === 0 || merged[i - 1].x <= p.x)
    if (result === lines) result = { ...lines }
    result[answerId] = inOrder ? merged : sortBy(merged, (p) => p.x)
  }
  return result
}

// Chart points fetched for one stretch of a market's history.
export type FetchedMultiPoints = {
  // The stretch that was asked for, in milliseconds.
  min: number
  max: number
  // Whether it ran up to the market's last bet at the time.
  reachedLastBet: boolean
  data: MultiPoints
}

// Fetched points, with the bets that have arrived live since added. A stretch
// that ended before the market's last bet is a look at the past, and nothing
// is added to it.
export const withLivePoints = (
  fetched: FetchedMultiPoints,
  live: MultiPoints
): MultiPoints => {
  if (!fetched.reachedLastBet) return fetched.data
  const inStretch: MultiPoints = {}
  for (const answerId of Object.keys(live)) {
    const points = live[answerId].filter((p) => p.x >= fetched.min)
    if (points.length > 0) inStretch[answerId] = points
  }
  return addMultiPoints(fetched.data, inStretch)
}

// Which points a chart draws.
//
// With the whole history on screen, the whole history. Zoomed in, the fetched
// window, if it covers what is on screen: it was fetched for this view, or for
// a wider one the user has since zoomed further into. Until such a window
// arrives the coarser whole history stands in, unless there is none to stand
// in, in which case any fetched window beats nothing.
export const chooseChartPoints = (args: {
  isZoomed: boolean
  // The latest window fetched, if any.
  zoomed: FetchedMultiPoints | undefined
  // The whole history, live bets included.
  wholeHistory: MultiPoints
  // Whether wholeHistory has a line for every answer the chart draws.
  hasWholeHistory: boolean
  live: MultiPoints
  // What is on screen, in milliseconds. Undefined before the chart is laid out.
  view: { min: number; max: number } | undefined
  createdTime: number
}) => {
  const { isZoomed, zoomed, wholeHistory, hasWholeHistory, live, view } = args
  if (!isZoomed || !zoomed) return wholeHistory
  const coversView =
    view !== undefined &&
    zoomed.min <= Math.max(view.min, args.createdTime) &&
    (zoomed.reachedLastBet || zoomed.max >= view.max)
  return coversView || !hasWholeHistory
    ? withLivePoints(zoomed, live)
    : wholeHistory
}
