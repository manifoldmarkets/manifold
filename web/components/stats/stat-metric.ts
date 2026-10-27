import { ReactNode } from 'react'

import {
  getCompareOffset,
  getComparePoints,
  getStatsWindow,
  hasComparableCoverage,
  shiftWindow,
  sliceWindow,
  STATS_RANGES,
  StatsCompareKey,
  StatsRangeKey,
  StatsSummaryKind,
  StatsWindow,
  summarizePoints,
} from 'common/stats-window'
import { formatLargeNumber, formatPercent } from 'common/util/format'
import {
  STATS_COMPARE_COLOR,
  STATS_SERIES_COLORS,
  StatsChartSeries,
} from './stats-chart'
import { Point } from './stats-series'

// One way to chart a metric: its daily values, a rolling average, a
// weekly total and so on.
export type MetricView = { key: string; label: string; values: Point[] }

// A range's summary of a metric for its tile: the value and how many days
// went into it (to judge whether a comparison window is complete).
export type WindowSummary = { value: number; days: number }

// A metric the stats explorer can show as a tile and chart.
export type StatMetric = {
  key: string
  label: string
  description: ReactNode
  // What the values count ('people', 'mana', 'percent', ...). Only metrics
  // with the same unit can be overlaid on one axis.
  unit: string
  // Values are fractions (0.25 is 25%).
  pct?: boolean
  views: MetricView[]
  // The view the chart opens on.
  defaultView: string
  // How a tile sums up the selected range: the total or the daily average of
  // a view (the daily view by default), or the metric's own calculation.
  // Defaults to the daily average.
  summary?:
    | { kind: StatsSummaryKind; view?: string }
    | ((window: StatsWindow) => WindowSummary | undefined)
  note?: ReactNode
}

export type MetricChange = {
  text: string
  direction: 'up' | 'down' | 'flat'
}

export const getView = (metric: StatMetric, key?: string) =>
  metric.views.find((v) => v.key === key) ??
  metric.views.find((v) => v.key === metric.defaultView) ??
  metric.views[0]

export const formatMetricValue = (metric: StatMetric, y: number) =>
  metric.pct ? formatPercent(y) : formatLargeNumber(y)

// Rates change in percentage points, counts in percent.
export const describeChange = (
  pct: boolean | undefined,
  now: number,
  before: number
): MetricChange | undefined => {
  if (pct) {
    const points = (now - before) * 100
    if (!Number.isFinite(points)) return undefined
    const rounded = Math.round(points * 10) / 10
    return {
      text: `${rounded < 0 ? '−' : '+'}${Math.abs(rounded).toFixed(1)} pts`,
      direction: rounded === 0 ? 'flat' : rounded > 0 ? 'up' : 'down',
    }
  }
  if (!(before > 0)) return undefined
  const percent = Math.round(((now - before) / before) * 100)
  if (!Number.isFinite(percent)) return undefined
  return {
    text: `${percent < 0 ? '−' : '+'}${Math.abs(percent)}%`,
    direction: percent === 0 ? 'flat' : percent > 0 ? 'up' : 'down',
  }
}

const rangeText = (range: StatsRangeKey) =>
  range === 'all' ? 'All-time' : range.toUpperCase()

export const compareText = (range: StatsRangeKey, compare: StatsCompareKey) =>
  compare === 'year'
    ? 'vs same period last year'
    : `vs previous ${STATS_RANGES.find((r) => r.key === range)?.label ?? ''}`

// What a tile shows for the selected range: the range's total or average,
// its change against the comparison window (the previous period when no
// comparison is picked), and the range's values for the sparkline.
export const getMetricSummary = (
  metric: StatMetric,
  range: StatsRangeKey,
  compare: StatsCompareKey
) => {
  const { summary } = metric
  const base =
    typeof summary === 'object' && summary.view
      ? getView(metric, summary.view)
      : getView(
          metric,
          metric.views.some((v) => v.key === 'daily') ? 'daily' : undefined
        )
  const kind = typeof summary === 'object' ? summary.kind : 'mean'
  const lastDay = base.values[base.values.length - 1]?.x
  const label =
    typeof summary === 'function'
      ? rangeText(range)
      : `${rangeText(range)} ${
          kind === 'sum' ? 'total' : metric.pct ? 'avg' : 'avg/day'
        }`
  if (!lastDay) return { label, value: undefined, change: undefined, spark: [] }

  const summarize = (window: StatsWindow): WindowSummary | undefined => {
    if (typeof summary === 'function') return summary(window)
    const points = sliceWindow(base.values, window).filter((p) =>
      Number.isFinite(p.y)
    )
    const value = summarizePoints(points, kind)
    return value === undefined ? undefined : { value, days: points.length }
  }

  const window = getStatsWindow(lastDay, range)
  const current = summarize(window)
  const offset = getCompareOffset(
    window,
    compare === 'none' ? 'previous' : compare
  )
  const before = offset ? summarize(shiftWindow(window, offset)) : undefined
  const change =
    current && before && hasComparableCoverage(current.days, before.days)
      ? describeChange(metric.pct, current.value, before.value)
      : undefined

  return {
    label,
    value: current?.value,
    change,
    spark: sliceWindow(base.values, window).map((p) => p.y),
  }
}

// The chart's series for the selected range: the primary values, then
// either overlays (other metrics or pages) or, when there are none, the
// dashed comparison window.
export const buildChartSeries = (props: {
  label: string
  values: Point[]
  range: StatsRangeKey
  compare: StatsCompareKey
  overlays?: { key: string; label: string; values: Point[] }[]
}): StatsChartSeries[] => {
  const { label, values, range, compare, overlays = [] } = props
  const lastDay = [values, ...overlays.map((o) => o.values)]
    .map((v) => v[v.length - 1]?.x)
    .filter((x): x is string => !!x)
    .sort()
    .pop()
  if (!lastDay) return []
  const window = getStatsWindow(lastDay, range)
  const primary: StatsChartSeries = {
    key: 'primary',
    label,
    color: STATS_SERIES_COLORS[0],
    points: sliceWindow(values, window),
  }
  if (overlays.length > 0)
    return [
      primary,
      ...overlays.map((o, i) => ({
        key: o.key,
        label: o.label,
        color: STATS_SERIES_COLORS[(i + 1) % STATS_SERIES_COLORS.length],
        points: sliceWindow(o.values, window),
      })),
    ]
  const offset = getCompareOffset(window, compare)
  if (!offset) return [primary]
  return [
    primary,
    {
      key: 'compare',
      label: compare === 'year' ? 'Last year' : 'Previous period',
      color: STATS_COMPARE_COLOR,
      points: getComparePoints(values, window, offset),
      dashed: true,
      shiftedDays: offset,
    },
  ]
}
