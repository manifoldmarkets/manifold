import { DAY_MS, MONTH_MS, WEEK_MS } from 'common/util/time'

export type ProbChanges = { day: number; week: number; month: number }

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

// Whether anything about a market's probability has moved since a run last
// stored its changes. The frequent contract-metrics run looks month-ago
// probabilities up only for markets where this is true, and keeps the stored
// month change everywhere else.
//
// The day and week changes are recomputed from bet history on every run, and
// come out exactly as stored unless the probability moved or a bet crossed the
// day-ago or week-ago mark. So comparing them catches a trade, a resolution, an
// undone resolution and an added answer alike, with no timestamp to rely on.
// The stored probability, where there is one, also catches a market that was
// resolved for more than a week (day and week both zero) and then unresolved.
export const movedSinceStored = (
  stored: { prob?: number; changes: Partial<ProbChanges> | undefined },
  next: { prob: number; changes: ProbChanges }
) =>
  stored.changes?.day !== next.changes.day ||
  stored.changes?.week !== next.changes.week ||
  (stored.prob !== undefined && stored.prob !== next.prob)
