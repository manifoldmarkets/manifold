import { ReactNode } from 'react'
import dayjs from 'dayjs'

import { formatLargeNumber, formatPercent } from 'common/util/format'
import { Point } from './stats-series'

// One way to chart a metric: its daily values, a rolling average, a
// weekly total and so on.
export type MetricView = { key: string; label: string; values: Point[] }

// A metric the stats explorer can show as a tile and chart.
export type StatMetric = {
  key: string
  label: string
  description: ReactNode
  // Values are fractions (0.25 is 25%).
  pct?: boolean
  views: MetricView[]
  // The view the tile summarizes and the chart opens on.
  defaultView: string
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
const describeChange = (
  metric: StatMetric,
  now: number,
  before: number
): MetricChange | undefined => {
  if (metric.pct) {
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

// The latest value of the metric's default view, and its change from the
// same view 7 days earlier (which also cancels out the day of the week).
export const getMetricHeadline = (metric: StatMetric) => {
  const view = getView(metric)
  const latest = view.values[view.values.length - 1]
  if (!latest) return { view, latest: undefined, change: undefined }
  const weekAgoX = dayjs(latest.x).subtract(7, 'day').format('YYYY-MM-DD')
  const weekAgo = view.values.find((p) => p.x === weekAgoX)
  const change = weekAgo
    ? describeChange(metric, latest.y, weekAgo.y)
    : undefined
  return { view, latest, change }
}
