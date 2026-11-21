import { groupBy, mapValues, sortBy } from 'lodash'
import { Answer } from 'common/answer'
import { pForProbability } from 'common/calculate-cpmm'
import { Contract, isMultiCpmm } from 'common/contract'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'

// What one market-probs-history request may cover: a 15-minute timelapse
// over three days, or 5-minute frames over a day.
export const PROBS_HISTORY_MAX_WINDOW_MS = 72 * HOUR_MS
export const PROBS_HISTORY_MIN_STEP_MS = 5 * MINUTE_MS
export const PROBS_HISTORY_MAX_FRAMES = 300

// [frame index, probability] at each frame where the probability changed.
// It holds until the next point; frames before the first point have none.
export type ProbChangePoints = [number, number][]

export type MarketProbsSeries = {
  prob?: ProbChangePoints
  answerProbs?: { [answerId: string]: ProbChangePoints }
}

export type MarketProbsHistory = {
  // Frame times, ascending and one step apart.
  times: number[]
  markets: { [contractId: string]: MarketProbsSeries }
}

export type MarketProbs = {
  prob?: number
  answerProbs?: { [answerId: string]: number | undefined }
}

export type BetProbRow = {
  contractId: string
  answerId: string | null
  createdTime: number
  probBefore: number
  probAfter: number
}

const isProb = (x: number | undefined): x is number =>
  x !== undefined && Number.isFinite(x) && x >= 0 && x <= 1

// 0.01%: finer than any odds the site shows (formatOdds stops at 0.1%).
const roundProb = (prob: number) => Math.round(prob * 10_000) / 10_000

// Every step from start up to now.
export function probsHistoryFrameTimes(
  start: number,
  step: number,
  now: number
) {
  const times: number[] = []
  for (let t = start; t <= now; t += step) times.push(t)
  return times
}

// Each market's probability at each frame, from the bets placed after the
// first frame. Every bet records the probability before and after it, and in
// sum-to-one markets the other answers' moves are recorded as redemption
// bets, so the first bet after the first frame opens a series at its
// probBefore. A series with no bets since sits at its current probability.
// Moves without a bet (an answer added to a sum-to-one market) are not in
// the bets: the frames before the next bet miss them.
export function buildMarketProbsHistory(
  times: number[],
  current: { [contractId: string]: MarketProbs },
  bets: BetProbRow[]
): MarketProbsHistory['markets'] {
  const bySeries = groupBy(
    sortBy(bets, (b) => b.createdTime),
    (b) => `${b.contractId}:${b.answerId ?? ''}`
  )
  const series = (
    contractId: string,
    answerId: string | null,
    now: number | undefined
  ) =>
    changePoints(times, bySeries[`${contractId}:${answerId ?? ''}`] ?? [], now)
  return mapValues(current, (probs, contractId) => ({
    ...(probs.prob !== undefined && {
      prob: series(contractId, null, probs.prob),
    }),
    ...(probs.answerProbs && {
      answerProbs: mapValues(probs.answerProbs, (prob, answerId) =>
        series(contractId, answerId, prob)
      ),
    }),
  }))
}

function changePoints(
  times: number[],
  bets: BetProbRow[],
  current: number | undefined
): ProbChangePoints {
  const points: ProbChangePoints = []
  let next = 0
  let prob = bets.length > 0 ? bets[0].probBefore : current
  times.forEach((time, frame) => {
    while (next < bets.length && bets[next].createdTime <= time)
      prob = bets[next++].probAfter
    if (!isProb(prob)) return
    const rounded = roundProb(prob)
    if (points.length === 0 || points[points.length - 1][1] !== rounded)
      points.push([frame, rounded])
  })
  return points
}

const probAtFrame = (points: ProbChangePoints | undefined, frame: number) => {
  let prob: number | undefined
  for (const [at, p] of points ?? []) {
    if (at > frame) break
    prob = p
  }
  return prob
}

export function marketProbsAtFrame(
  series: MarketProbsSeries | undefined,
  frame: number
): MarketProbs {
  return {
    prob: probAtFrame(series?.prob, frame),
    answerProbs:
      series?.answerProbs &&
      mapValues(series.answerProbs, (points) => probAtFrame(points, frame)),
  }
}

const resolvedAfter = (resolutionTime: number | undefined, time: number) =>
  resolutionTime !== undefined && resolutionTime > time

// Every resolution field a market type has (`resolutions` is multi and MKT only).
const UNRESOLVED = {
  isResolved: false,
  resolution: undefined,
  resolutionTime: undefined,
  resolutionProbability: undefined,
  resolutions: undefined,
  resolverId: undefined,
} as const

// The market as it stood at `time`: re-priced to its probabilities then,
// without resolutions or answers that came later. Undefined if it did not
// exist yet. Re-pricing moves p, not the pools, so the result is for display
// only: never quote or place a trade against it.
export function contractAsOf(
  contract: Contract,
  time: number,
  probs: MarketProbs | undefined
): Contract | undefined {
  if (contract.createdTime > time) return undefined
  const c: Contract = resolvedAfter(contract.resolutionTime, time)
    ? { ...contract, ...UNRESOLVED }
    : contract
  if (c.mechanism === 'cpmm-1') {
    const q = probs?.prob
    if (!isProb(q)) return c
    const p = pForProbability({ YES: c.pool.YES, NO: c.pool.NO }, q)
    return isProb(p) ? { ...c, p, prob: q } : c
  }
  if (isMultiCpmm(c))
    return {
      ...c,
      answers: c.answers
        .filter((a) => a.createdTime <= time)
        .map((a) => answerAsOf(a, time, probs?.answerProbs?.[a.id])),
    }
  return c
}

function answerAsOf(answer: Answer, time: number, q: number | undefined) {
  const a: Answer = resolvedAfter(answer.resolutionTime, time)
    ? {
        ...answer,
        resolution: undefined,
        resolutionTime: undefined,
        resolutionProbability: undefined,
        resolverId: undefined,
      }
    : answer
  if (!isProb(q)) return a
  const p = pForProbability({ YES: a.poolYes, NO: a.poolNo }, q)
  return isProb(p) ? { ...a, p, prob: q } : a
}
