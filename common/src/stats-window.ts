// Date windows for /stats charts: the selected range ending on a series' last
// day, and the window it's compared against. Days are LA calendar days as
// 'YYYY-MM-DD'; the arithmetic runs on UTC day numbers, so it never depends
// on the viewer's timezone or DST.

const DAY_MS = 24 * 60 * 60 * 1000
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

// Days since 1970-01-01, or NaN for anything that isn't YYYY-MM-DD.
export const toDayNumber = (day: string) => {
  const m = DAY_PATTERN.exec(day)
  if (!m) return NaN
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS
}

export const fromDayNumber = (n: number) =>
  new Date(n * DAY_MS).toISOString().slice(0, 10)

export const addDays = (day: string, n: number) =>
  fromDayNumber(toDayNumber(day) + n)

export const STATS_RANGES = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
  { key: '1y', label: '1Y', days: 365 },
  { key: 'all', label: 'All', days: undefined },
] as const
export type StatsRangeKey = (typeof STATS_RANGES)[number]['key']

export const STATS_COMPARES = [
  { key: 'none', label: 'No comparison' },
  { key: 'previous', label: 'Previous period' },
  { key: 'year', label: 'Same period last year' },
] as const
export type StatsCompareKey = (typeof STATS_COMPARES)[number]['key']

export const isStatsRangeKey = (v: unknown): v is StatsRangeKey =>
  STATS_RANGES.some((r) => r.key === v)
export const isStatsCompareKey = (v: unknown): v is StatsCompareKey =>
  STATS_COMPARES.some((c) => c.key === v)

// Inclusive [from, to]. `from` is undefined for 'all'.
export type StatsWindow = {
  from: string | undefined
  to: string
  days: number | undefined
}

export const getStatsWindow = (
  lastDay: string,
  range: StatsRangeKey
): StatsWindow => {
  const days = STATS_RANGES.find((r) => r.key === range)?.days
  return {
    from: days ? addDays(lastDay, -(days - 1)) : undefined,
    to: lastDay,
    days,
  }
}

// How many days back the comparison window sits: one window length for the
// previous period, and 52 weeks for last year so weekdays line up. Nothing to
// compare for 'all'.
export const getCompareOffset = (
  window: StatsWindow,
  compare: StatsCompareKey
): number | undefined => {
  if (compare === 'none' || !window.days) return undefined
  return compare === 'previous' ? window.days : 364
}

export const isInWindow = (day: string, from: string | undefined, to: string) =>
  (from === undefined || day >= from) && day <= to

export const sliceWindow = <P extends { x: string }>(
  points: P[],
  window: Pick<StatsWindow, 'from' | 'to'>
) => points.filter((p) => isInWindow(p.x, window.from, window.to))

// The window `offset` days earlier, as a window of its own.
export const shiftWindow = (
  window: StatsWindow,
  offset: number
): StatsWindow => ({
  from: window.from === undefined ? undefined : addDays(window.from, -offset),
  to: addDays(window.to, -offset),
  days: window.days,
})

// The comparison window's points, moved forward onto the current window's
// days so the two can share an x axis. `sourceX` keeps each point's real day.
export const getComparePoints = (
  points: { x: string; y: number }[],
  window: StatsWindow,
  offset: number
) =>
  sliceWindow(points, shiftWindow(window, offset)).map((p) => ({
    x: addDays(p.x, offset),
    y: p.y,
    sourceX: p.x,
  }))

export type StatsSummaryKind = 'sum' | 'mean'

// Total or daily average of the finite values, or undefined if there are none.
export const summarizePoints = (
  points: { y: number }[],
  kind: StatsSummaryKind
) => {
  const ys = points.map((p) => p.y).filter((y) => Number.isFinite(y))
  if (ys.length === 0) return undefined
  const total = ys.reduce((a, b) => a + b, 0)
  return kind === 'sum' ? total : total / ys.length
}

// Whether a comparison window holds enough days to compare against: at least
// 80% of the current window's. A short one (data starting partway through, or
// a gap) would make a total look like a drop.
export const hasComparableCoverage = (current: number, comparison: number) =>
  current > 0 && comparison >= current * 0.8
