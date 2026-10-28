import { ReactNode } from 'react'

import { getStatSignal, StatSignal, weeklyMeans } from 'common/stat-signals'
import {
  countDays,
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
import { formatPercent } from 'common/util/format'
import {
  MONTHS,
  STATS_COMPARE_COLOR,
  STATS_SERIES_COLORS,
  StatsChartSeries,
} from './stats-chart'
import { formatCount, Point } from './stats-series'

// One way to chart a metric: its daily values, a rolling average, a
// weekly total and so on.
export type MetricView = { key: string; label: string; values: Point[] }

// A range's summary of a metric for its tile: the value and how many days
// went into it (to judge whether a comparison window is complete).
// firstDay: the first day it counted, where its label says it starts and its
// missing days are counted from.
export type WindowSummary = { value: number; days: number; firstDay?: string }

// A metric the stats explorer can show as a tile and chart.
export type StatMetric = {
  key: string
  label: string
  description: ReactNode
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
  metric.pct ? formatPercent(y) : formatCount(y)

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

export const compareText = (range: StatsRangeKey, compare: StatsCompareKey) =>
  compare === 'year'
    ? 'vs same period last year'
    : `vs previous ${STATS_RANGES.find((r) => r.key === range)?.label ?? ''}`

// "Mar ’22" for the first of a month, "Dec 17 ’21" otherwise. Non-breaking
// spaces, so a wrapped label never splits the date.
export const formatSince = (day: string) => {
  const [y, m, d] = day.split('-')
  return `${MONTHS[+m - 1]}${+d === 1 ? '' : ` ${+d}`} ’${y.slice(2)}`
}

// "Oct 26".
export const formatShortDay = (day: string) => {
  const [, m, d] = day.split('-')
  return `${MONTHS[+m - 1]} ${+d}`
}

// The view a metric's summaries read: its own pick, else the daily values.
export const getSummaryView = (metric: StatMetric) =>
  typeof metric.summary === 'object' && metric.summary.view
    ? getView(metric, metric.summary.view)
    : getView(
        metric,
        metric.views.some((v) => v.key === 'daily') ? 'daily' : undefined
      )

const meanOver = (values: Point[], window: StatsWindow) => {
  const points = sliceWindow(values, window).filter((p) => Number.isFinite(p.y))
  const value = summarizePoints(points, 'mean')
  return value === undefined ? undefined : { value, days: points.length }
}

// "3 days missing", for a figure whose window has days without data.
export const missingDaysText = (missing: number) =>
  `${missing} day${missing === 1 ? '' : 's'} missing`

// What a tile shows for the selected range: the range's total or average,
// its change against the comparison window (the previous period when no
// comparison is picked), and the range's values for the sparkline.
//
// The figure never claims more than its data covers. When the metric's data
// starts inside the window, and always for All, the label says where it
// starts ("Total since Dec 17 ’21"), not "All-time" or "1Y". Calendar days
// from there with no data are counted in missingDays, for the caller to
// show. A change needs 80% of the days in both windows.
export const getMetricSummary = (
  metric: StatMetric,
  range: StatsRangeKey,
  compare: StatsCompareKey
) => {
  const { summary } = metric
  const base = getSummaryView(metric)
  const kind = typeof summary === 'object' ? summary.kind : 'mean'
  const kindText =
    typeof summary === 'function'
      ? undefined
      : kind === 'sum'
      ? 'total'
      : metric.pct
      ? 'avg'
      : 'avg/day'
  const lastDay = base.values[base.values.length - 1]?.x
  if (!lastDay)
    return {
      label: '',
      value: undefined,
      change: undefined,
      missingDays: 0,
      spark: [],
    }

  const summarize = (window: StatsWindow): WindowSummary | undefined => {
    if (typeof summary === 'function') return summary(window)
    const points = sliceWindow(base.values, window).filter((p) =>
      Number.isFinite(p.y)
    )
    const value = summarizePoints(points, kind)
    return value === undefined
      ? undefined
      : { value, days: points.length, firstDay: points[0]?.x }
  }

  const window = getStatsWindow(lastDay, range)
  const current = summarize(window)
  // The figure's own first day: a function summary can count days its chart
  // view has no point for (a page's zero-visitor day has no rate).
  const firstDay =
    current?.firstDay ??
    sliceWindow(base.values, window).find((p) => Number.isFinite(p.y))?.x
  const since =
    firstDay && (!window.from || firstDay > window.from)
      ? formatSince(firstDay)
      : undefined
  const rangeLabel = STATS_RANGES.find((r) => r.key === range)?.label ?? ''
  const label = since
    ? kindText
      ? `${kindText[0].toUpperCase()}${kindText.slice(1)} since ${since}`
      : `Since ${since}`
    : kindText
    ? `${rangeLabel} ${kindText}`
    : rangeLabel
  const missingDays =
    firstDay && current
      ? Math.max(
          0,
          countDays(
            window.from && window.from > firstDay ? window.from : firstDay,
            window.to
          ) - current.days
        )
      : 0
  const offset = getCompareOffset(
    window,
    compare === 'none' ? 'previous' : compare
  )
  const before = offset ? summarize(shiftWindow(window, offset)) : undefined
  // An average over most of a window's days compares fairly; a total missing
  // a day doesn't (six days' signups against seven read as a drop), so totals
  // compare only when both windows are complete.
  const expectedDays = window.days ?? 0
  const comparable =
    !!current &&
    !!before &&
    (typeof summary !== 'function' && kind === 'sum'
      ? expectedDays > 0 &&
        current.days === expectedDays &&
        before.days === expectedDays
      : hasComparableCoverage(current.days, before.days, expectedDays))
  const change =
    comparable && current && before
      ? describeChange(metric.pct, current.value, before.value)
      : undefined

  return {
    label,
    value: current?.value,
    change,
    missingDays,
    spark: sliceWindow(base.values, window).map((p) => p.y),
  }
}

// The quick figures, whatever the page's range: the latest day's value, the
// average of the 7 days to it with its change from the 7 before and from the
// same 7 days a year (52 weeks) earlier, the weekly averages behind the trend
// line, and the week's signal if it's unusual. weekDays is how many of the 7
// days have data.
export const getMetricGlance = (metric: StatMetric) => {
  const base = getSummaryView(metric)
  const latest = base.values[base.values.length - 1]
  if (!latest) return undefined
  const week = getStatsWindow(latest.x, '7d')
  const current = meanOver(base.values, week)
  const compareTo = (key: 'previous' | 'year') => {
    const offset = getCompareOffset(week, key)
    const before = offset
      ? meanOver(base.values, shiftWindow(week, offset))
      : undefined
    return {
      value: before?.value,
      change:
        current && before && hasComparableCoverage(current.days, before.days, 7)
          ? describeChange(metric.pct, current.value, before.value)
          : undefined,
    }
  }
  const weeks = weeklyMeans(base.values, latest.x)
  const lastYear = compareTo('year')
  return {
    latest,
    weekAvg: current?.value,
    weekDays: current?.days ?? 0,
    change: compareTo('previous').change,
    yearAgoAvg: lastYear.value,
    yearChange: lastYear.change,
    weeks,
    signal: getStatSignal(weeks),
  }
}

export type MetricGlance = NonNullable<ReturnType<typeof getMetricGlance>>

// Every metric on this page is better higher, so a rise reads as good.
export const changeTone = (direction: 'up' | 'down' | 'flat') =>
  direction === 'up' ? 'good' : direction === 'down' ? 'bad' : 'neutral'

export const TONE_TEXT = {
  good: 'text-teal-600',
  bad: 'text-scarlet-600',
  neutral: 'text-ink-500',
} as const

// A signal's badge text, and a sentence for its tooltip.
export const describeSignal = (signal: StatSignal) => {
  switch (signal.kind) {
    case 'high':
    case 'low': {
      const what = signal.kind === 'high' ? 'Highest' : 'Lowest'
      return {
        short: `${what} since ${formatSince(signal.since)}`,
        long: signal.sinceStart
          ? `${what} 7-day average since the data begins (${formatSince(
              signal.since
            )})`
          : `${what} 7-day average since the week to ${formatSince(
              signal.since
            )}, ${signal.weeks} weeks earlier`,
      }
    }
    case 'jump':
    case 'drop': {
      const factor = Math.round(signal.factor * 10) / 10
      return {
        short: signal.kind === 'jump' ? 'Unusual jump' : 'Unusual drop',
        long: `This week moved ${factor}× as far as a typical week over the last 12`,
      }
    }
    case 'rising':
    case 'falling':
      return {
        short: `${signal.kind === 'rising' ? 'Up' : 'Down'} ${
          signal.weeks
        } weeks running`,
        long: `The 7-day average ${
          signal.kind === 'rising' ? 'rose' : 'fell'
        } each of the last ${signal.weeks} weeks`,
      }
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
  overlays?: {
    key: string
    label: string
    values: Point[]
    pct?: boolean
    ownAxis?: boolean
  }[]
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
        pct: o.pct,
        secondaryAxis: o.ownAxis,
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
