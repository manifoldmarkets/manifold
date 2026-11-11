import { DAY_MS, HOUR_MS, MONTH_MS, WEEK_MS } from 'common/util/time'

export type ProbChanges = { day: number; week: number; month: number }

// The frequent contract-metrics run (every ~21 minutes) looks up month-ago
// probabilities only for markets that traded or resolved within this window.
// Every other market keeps the month change an earlier run stored, and the
// daily full run recomputes them all.
export const MONTH_REFRESH_WINDOW_MS = 2 * HOUR_MS

// A probability a month ago and a change over the month are both numbers
// between -1 and 1, and treating the stored change as the old probability made
// the month change flip to (probability - change) on every frequent run. They
// are separate cases here so one can't be passed as the other.
export type MonthSource =
  // This run looked the month-ago probability up. Undefined: no bet history.
  | { kind: 'loaded'; monthAgoProb: number | undefined }
  // This run did not look it up: keep what an earlier run stored.
  | { kind: 'kept'; storedMonthChange: number | undefined }

const finiteOr = (n: number | null | undefined, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? n : fallback

export const computeProbChanges = (args: {
  now: number
  // Current probability: the resolution value if resolved, else the pool's.
  prob: number
  // The pool's probability, which stands in for a missing historical one.
  poolProb: number
  resolutionTime: number | null | undefined
  // Undefined: no bet history at that time.
  dayAgoProb: number | undefined
  weekAgoProb: number | undefined
  month: MonthSource
}): ProbChanges => {
  const { now, prob, poolProb, resolutionTime, dayAgoProb, weekAgoProb } = args
  const { month } = args

  // A window that opened after the market resolved saw no change.
  const resolvedBefore = (windowMs: number) =>
    !!resolutionTime && resolutionTime <= now - windowMs

  const changeSince = (agoProb: number | undefined) =>
    finiteOr(prob - finiteOr(agoProb, poolProb), 0)

  return {
    day: resolvedBefore(DAY_MS) ? 0 : changeSince(dayAgoProb),
    week: resolvedBefore(WEEK_MS) ? 0 : changeSince(weekAgoProb),
    month: resolvedBefore(MONTH_MS)
      ? 0
      : month.kind === 'loaded'
      ? changeSince(month.monthAgoProb)
      : finiteOr(month.storedMonthChange, 0),
  }
}

// Whether a market's probability may have moved since `since`: it traded, it
// resolved, or one of its answers resolved.
export const tradedOrResolvedSince = (
  market: { lastBetTime?: number; resolutionTime?: number | null },
  answers: { resolutionTime?: number | null }[],
  since: number
) =>
  (market.lastBetTime ?? 0) > since ||
  (market.resolutionTime ?? 0) > since ||
  answers.some((a) => (a.resolutionTime ?? 0) > since)
