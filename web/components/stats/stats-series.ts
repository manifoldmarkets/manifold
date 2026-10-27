import { sum } from 'lodash'

import { average } from 'common/util/math'
import { formatLargeNumber, formatWithCommas } from 'common/util/format'
import { StatsPageRow } from 'web/lib/supabase/stats'

// The columns /stats loads (web/lib/supabase/stats.ts).
export type DailyStatsRow = StatsPageRow

// One day of a chart series; x is YYYY-MM-DD.
export type Point = { x: string; y: number }

// daily_stats columns that hold a number.
export type NumericStatsColumn = {
  [K in keyof DailyStatsRow]-?: DailyStatsRow[K] extends number | null
    ? K
    : never
}[keyof DailyStatsRow]

export const dataForStats =
  (stats: DailyStatsRow[]) =>
  (key: NumericStatsColumn): Point[] =>
    stats
      .map((row) => ({ x: row.start_date, y: row[key] }))
      .filter((p): p is Point => p.y != null && Number.isFinite(p.y))

// num / den for each day both are present and den is positive.
export const ratioSeries = (
  stats: DailyStatsRow[],
  num: NumericStatsColumn,
  den: NumericStatsColumn
): Point[] =>
  stats
    .filter((row) => row[num] != null && (row[den] ?? 0) > 0)
    .map((row) => ({ x: row.start_date, y: row[num]! / row[den]! }))
    .filter((p) => Number.isFinite(p.y))

export const rollingAvg = (arr: Point[], period: number) =>
  arr.map(({ x }, i) => {
    const start = Math.max(0, i - period + 1)
    const end = i + 1
    const values = arr.slice(start, end).map((d) => d.y ?? 0)
    return { x, y: values.length ? average(values) : 0 }
  })

export const rollingSum = (arr: Point[], period: number) =>
  arr.map(({ x }, i) => {
    const start = Math.max(0, i - period + 1)
    const end = i + 1
    const values = arr.slice(start, end).map((d) => d.y ?? 0)
    const total = sum(values)
    // scale to make up for holes or missing data at the start
    const adjusted =
      values.length == period ? total : (total * period) / values.length
    return { x, y: adjusted }
  })

// Sum of numerators over sum of denominators across a trailing window, for
// rates whose daily values are too small to average. A day with a null
// numerator is left out of both sums.
export const rollingRatio = (
  days: { x: string; num: number | null; den: number }[],
  period: number
): Point[] =>
  days.flatMap(({ x }, i) => {
    const window = days
      .slice(Math.max(0, i - period + 1), i + 1)
      .filter((d) => d.num != null)
    const den = sum(window.map((d) => d.den))
    if (window.length === 0 || den <= 0) return []
    const y = sum(window.map((d) => d.num!)) / den
    return Number.isFinite(y) ? [{ x, y }] : []
  })

// Counts on tiles, tooltips and tables: "77k", "1,819", "99", "1.9". A decimal
// only matters below 10 (bets per new user); above, it's just noise.
export const formatCount = (y: number) =>
  Math.abs(y) >= 10_000
    ? formatLargeNumber(y)
    : Math.abs(y) >= 10
    ? formatWithCommas(Math.round(y))
    : String(Math.round(y * 10) / 10)

export const round = (point: Point) => ({
  x: point.x,
  y: Math.round(point.y),
})
