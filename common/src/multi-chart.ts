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

type LinePoints = MultiPoints[string]

const NO_LINE_POINTS: LinePoints = []

const isInTimeOrder = (points: { x: number }[]) =>
  points.every((p, i) => i === 0 || points[i - 1].x <= p.x)

// Thins points to a few from each of at most `stretches` runs of equal
// length: the first, the last, the lowest and the highest of the run. Only
// points that are there are kept, in the order they were in, so the last
// point of all is always one of them and nothing is placed at a time the
// line was not at.
export const thinPoints = <P extends { x: number; y: number }>(
  points: P[],
  stretches: number
) => {
  const size = Math.max(1, Math.ceil(points.length / Math.max(1, stretches)))
  const kept: P[] = []
  for (let start = 0; start < points.length; start += size) {
    const end = Math.min(start + size, points.length)
    let lowest = start
    let highest = start
    for (let i = start; i < end; i++) {
      if (points[i].y < points[lowest].y) lowest = i
      if (points[i].y > points[highest].y) highest = i
    }
    const indexes = [start, lowest, highest, end - 1].sort((a, b) => a - b)
    indexes.forEach((index, i) => {
      if (i === 0 || index !== indexes[i - 1]) kept.push(points[index])
    })
  }
  return kept
}

// A line cut down to at most `max` points: the newest half as it is, and the
// rest thinned to fit in the other half.
const thinOlderPoints = (line: LinePoints, max: number) => {
  const newest = Math.ceil(max / 2)
  const room = max - newest
  const older = line.slice(0, line.length - newest)
  const thinned =
    room >= 4
      ? thinPoints(older, Math.max(1, Math.floor(room / 8)))
      : older.slice(older.length - room)
  return [...thinned, ...line.slice(line.length - newest)]
}

// Adds points from the live feed to the lines kept from it, and keeps each
// line to `maxPerLine` points. A page left open on a busy market would
// otherwise keep every move of every answer for as long as it is open.
//
// Points are added in the order they come. Nothing is left out as a repeat:
// two moves of one answer in the same millisecond can end on a level it has
// been at before, and the last of them is where it stands. A line whose
// additions come out of time order is put back in order, points of one time
// keeping the order they came in.
//
// A line that outgrows the limit keeps its newest half as it is and has the
// older half thinned. Only the lines that gain a point are touched: the
// others keep their array, and with nothing to add `live` itself comes back.
export const addLivePoints = (
  live: MultiPoints,
  additions: MultiPoints,
  maxPerLine: number
): MultiPoints => {
  let result = live
  for (const answerId of Object.keys(additions)) {
    const added = additions[answerId]
    if (added.length === 0) continue
    const joined = [...(live[answerId] ?? NO_LINE_POINTS), ...added]
    const line = isInTimeOrder(joined) ? joined : sortBy(joined, (p) => p.x)
    if (result === live) result = { ...live }
    result[answerId] =
      line.length <= maxPerLine ? line : thinOlderPoints(line, maxPerLine)
  }
  return result
}

// A line of a market's history, carried on by the live points made after
// `latestBetTime`: the time of the last bet in the history the line was read
// from. Live points up to that time are in the history already. Undefined
// means that history holds no bet, so every live point follows it.
//
// The live points are not compared with the line's own, one by one. Either a
// time belongs to the history or it belongs to the live feed.
//
// Where the line is carried on, anything it has after the first live point
// added is dropped. Real history cannot be there. What can be there is
// filler: thinning a long line leaves a point a little past its last bet, at
// the level it had then, which would otherwise pull the line back to that
// level.
//
// With nothing to add, the line's own array comes back.
export const continueLine = (
  points: LinePoints,
  latestBetTime: number | undefined,
  live: LinePoints | undefined
): LinePoints => {
  if (!live || live.length === 0) return points
  const later =
    latestBetTime === undefined ? live : live.filter((p) => p.x > latestBetTime)
  if (later.length === 0) return points
  const first = later[0].x
  const isPastFirst = points.length > 0 && points[points.length - 1].x > first
  return [
    ...(isPastFirst ? points.filter((p) => p.x <= first) : points),
    ...later,
  ]
}

// A line of a market's whole history, with the time of the last bet in the
// history it was read from: the one the page was rendered with, or one that
// was fetched. Undefined if that history held no bet.
export type WholeHistoryLine = {
  points: LinePoints
  latestBetTime: number | undefined
}
export type WholeHistoryLines = { [answerId: string]: WholeHistoryLine }

const lineOf = (lines: WholeHistoryLines, answerId: string) =>
  Object.prototype.hasOwnProperty.call(lines, answerId)
    ? lines[answerId]
    : undefined

// The lines of one history of a market's whole life: one for each answer it
// was made with, empty if it has nothing for that answer.
export const getWholeHistoryLines = (history: {
  data: MultiPoints
  // The answers the history was made with.
  answerIds: string[]
  // The time of the last bet in it, if it has any.
  latestBetTime: number | undefined
}): WholeHistoryLines => {
  const lines: WholeHistoryLines = {}
  for (const answerId of history.answerIds)
    lines[answerId] = {
      points: history.data[answerId] ?? NO_LINE_POINTS,
      latestBetTime: history.latestBetTime,
    }
  return lines
}

const reachesAsFar = (a: number | undefined, b: number | undefined) =>
  (a ?? -Infinity) >= (b ?? -Infinity)

// The lines kept, with each line offered put in the place of the one kept
// for its answer, unless the one kept was read from a history that reaches
// further. The endpoint and the CDN in front of it can both hand back a copy
// older than what the chart has, and an older line must not replace a newer
// one. An answer with no line takes whatever is offered.
//
// With nothing taken, `kept` itself comes back.
export const withFurtherLines = (
  kept: WholeHistoryLines,
  offered: WholeHistoryLines
): WholeHistoryLines => {
  let result = kept
  for (const answerId of Object.keys(offered)) {
    const current = lineOf(kept, answerId)
    const line = offered[answerId]
    if (current && !reachesAsFar(line.latestBetTime, current.latestBetTime))
      continue
    if (result === kept) result = { ...kept }
    result[answerId] = line
  }
  return result
}

// What the whole-history view draws: each line, carried on by the live points
// made after the last bet of the history it was read from. An answer that has
// live points and no line yet is drawn from those alone.
export const getWholeHistoryPoints = (
  lines: WholeHistoryLines,
  live: MultiPoints
): MultiPoints => {
  const points: MultiPoints = {}
  for (const answerId of Object.keys(lines)) {
    const line = lines[answerId]
    points[answerId] = continueLine(
      line.points,
      line.latestBetTime,
      live[answerId]
    )
  }
  for (const answerId of Object.keys(live))
    if (!lineOf(lines, answerId)) points[answerId] = live[answerId]
  return points
}

// The answers the chart needs a whole-history line for and has none. Only
// answers the market has now count. One that is not there cannot be fetched,
// and asking again would not change that.
export const getUncoveredAnswerIds = (args: {
  // The answers on the chart, and any being previewed.
  neededIds: string[]
  // The market's answers now.
  knownIds: string[]
  lines: WholeHistoryLines
}) => {
  const known = new Set(args.knownIds)
  return args.neededIds.filter((id) => known.has(id) && !lineOf(args.lines, id))
}

// The latest of the times given, leaving out the undefined ones. Undefined if
// there are none.
export const latestDefined = (times: (number | undefined)[]) => {
  let latest: number | undefined
  for (const t of times)
    if (t !== undefined && (latest === undefined || t > latest)) latest = t
  return latest
}

// Whether a line on the chart was read from a history that ends before the
// last bet the page knows of. That history is then worth fetching again: the
// live feed, which brings the bets made since, can miss some. It starts after
// the page was rendered, and a dropped connection only resubscribes.
//
// An answer with no line is not behind. It is waiting for its first history.
export const isBehindLastBet = (args: {
  lines: WholeHistoryLines
  // The answers on the chart.
  answerIds: string[]
  // The last bet the page knows of. Undefined: it knows of none.
  knownLastBetTime: number | undefined
}) => {
  const { lines, knownLastBetTime } = args
  if (knownLastBetTime === undefined) return false
  return args.answerIds.some((id) => {
    const line = lineOf(lines, id)
    return (
      line !== undefined && knownLastBetTime > (line.latestBetTime ?? -Infinity)
    )
  })
}

// Whether the page's own feed holds a bet that a line on the chart is behind
// and that the live feed has not delivered: one made before the page
// subscribed, or while the connection was down. The page's feed catches up on
// those, but without the rows that move the other answers.
export const hasUndeliveredBet = (args: {
  lines: WholeHistoryLines
  // The answers on the chart.
  answerIds: string[]
  // The newest bet in the page's own feed that moved a probability, if any.
  latestPageBetTime: number | undefined
  // The newest bet the live feed has delivered that moved one, if any.
  latestLiveBetTime: number | undefined
}) =>
  args.latestPageBetTime !== undefined &&
  args.latestPageBetTime > (args.latestLiveBetTime ?? -Infinity) &&
  isBehindLastBet({
    lines: args.lines,
    answerIds: args.answerIds,
    knownLastBetTime: args.latestPageBetTime,
  })

// A request for a market's whole history that has been sent and has not come
// back: the answers it was made with, and the end of the stretch it asks for,
// which is left out of it.
export type WholeHistoryRequest = { answerIds: string[]; max: number }

// Whether a request already on its way will do, so that another need not be
// sent: it was made with every answer wanted and, if bets up to a time are
// wanted, it asks for them.
export const isOnItsWay = (
  requests: WholeHistoryRequest[],
  wanted: { answerIds: string[]; upTo?: number }
) =>
  requests.some(
    (request) =>
      (wanted.upTo === undefined || request.max > wanted.upTo) &&
      wanted.answerIds.every((id) => request.answerIds.includes(id))
  )

// Chart points fetched for one stretch of a market's history.
export type FetchedMultiPoints = {
  // The stretch that was asked for, in milliseconds. Both ends are left out.
  min: number
  max: number
  // Whether it ran up to the market's last bet at the time.
  reachedLastBet: boolean
  data: MultiPoints
  // The answers the market had when it was asked for. `data` has a line for
  // each, empty if nothing is known of it, and none for an answer that turned
  // up later.
  answerIds: string[]
  // The time of the latest bet that came back, if any did.
  latestBetTime: number | undefined
}

// The stretch to fetch for a zoomed view: from a little before its left edge,
// or before the market opened, to a millisecond past the earlier of its right
// edge and the market's last bet. A window that reached past the last bet
// could be answered now and the answer reused later, when it no longer holds
// every bet of the window.
//
// Everything is read off one snapshot, so whether the window runs up to the
// last bet is decided against the same last bet as its end.
export const getZoomWindow = (args: {
  // What is on screen, in milliseconds.
  view: { min: number; max: number }
  createdTime: number
  lastBetTime: number
  // How far before the left edge to start.
  leadMs: number
}) => {
  const { view, createdTime, lastBetTime, leadMs } = args
  return {
    min: Math.max(view.min, createdTime) - leadMs,
    max: Math.min(view.max, lastBetTime) + 1,
    reachedLastBet: view.max >= lastBetTime,
  }
}

// Fetched points, carried on by the bets that have arrived live since: those
// made after the last bet that came back or, if none came back, after the
// start of the stretch. A stretch that ended before the market's last bet is
// a look at the past, and nothing is added to it.
//
// With nothing to add, the fetched points themselves come back.
export const withLivePoints = (
  fetched: FetchedMultiPoints,
  live: MultiPoints
): MultiPoints => {
  if (!fetched.reachedLastBet) return fetched.data
  const after = fetched.latestBetTime ?? fetched.min
  let result = fetched.data
  for (const answerId of Object.keys(live)) {
    const points = fetched.data[answerId] ?? NO_LINE_POINTS
    const line = continueLine(points, after, live[answerId])
    if (line === points) continue
    if (result === fetched.data) result = { ...fetched.data }
    result[answerId] = line
  }
  return result
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
