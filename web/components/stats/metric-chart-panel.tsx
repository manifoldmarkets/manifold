import { ReactNode, useMemo } from 'react'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Select } from 'web/components/widgets/select'
import { ChartLegend } from './chart-legend'
import { QuickFigures, SignalBadge } from './quick-figures'
import {
  buildChartSeries,
  getMetricGlance,
  getView,
  StatMetric,
} from './stat-metric'
import { StatsChart } from './stats-chart'
import { Point } from './stats-series'
import { useStatsTime } from './stats-time'

// ownAxis: drawn against a second axis, for a series on a different scale
// from the metric's (another metric). Pages comparing the same metric share
// the metric's axis.
export type OverlaySeries = {
  key: string
  label: string
  values: Point[]
  pct?: boolean
  ownAxis?: boolean
}

// The selected metric's chart, with its quick figures (latest day, week,
// year), a switcher between its views and an optional overlay of other
// series. The card keeps one shape for every metric (a two-line description
// slot, a fixed-height figures row, a controls row that's always there, a
// legend row), so switching metrics doesn't move the chart or the controls.
export function MetricChartPanel(props: {
  metric: StatMetric
  viewKey?: string
  setViewKey: (key: string) => void
  // The primary line's legend label, when it isn't the metric's own.
  primaryLabel?: string
  overlayChoices?: { key: string; label: string }[]
  overlay?: string
  setOverlay?: (key: string) => void
  overlaySeries?: OverlaySeries[]
  children?: ReactNode
}) {
  const {
    metric,
    viewKey,
    setViewKey,
    primaryLabel,
    overlayChoices = [],
    overlay = 'none',
    setOverlay,
    overlaySeries = [],
    children,
  } = props
  const { range, compare } = useStatsTime()
  const view = getView(metric, viewKey)
  const series = buildChartSeries({
    label: primaryLabel ?? metric.label,
    values: view.values,
    range,
    compare,
    overlays: overlaySeries,
  })
  const canOverlay = overlayChoices.length > 0 && !!setOverlay
  const glance = useMemo(
    () => getMetricGlance(metric, view.key),
    [metric, view.key]
  )

  return (
    <Col className="bg-canvas-0 ring-ink-200 gap-3 rounded-lg p-4 ring-1">
      <Col className="gap-0.5">
        <Row className="min-w-0 items-center gap-2">
          <h2 className="text-ink-900 truncate text-lg font-semibold">
            {metric.label}
          </h2>
          {glance?.signal && (
            <SignalBadge signal={glance.signal} className="shrink" />
          )}
        </Row>
        <p
          className="text-ink-500 line-clamp-2 min-h-[2.5rem] text-sm"
          title={
            typeof metric.description === 'string'
              ? metric.description
              : undefined
          }
        >
          {metric.description}
        </p>
      </Col>
      <QuickFigures metric={metric} glance={glance} />
      <Row className="items-center justify-between gap-2">
        <div className="scrollbar-hide -my-1 min-w-0 overflow-x-auto py-1">
          <ChoicesToggleGroup
            ariaLabel={`${metric.label} view`}
            currentChoice={view.key}
            choicesMap={Object.fromEntries(
              metric.views.map((v) => [v.label, v.key])
            )}
            setChoice={(key) => setViewKey(String(key))}
            color="gray"
            toggleClassName="whitespace-nowrap !px-2.5 !py-1 text-xs"
          />
        </div>
        <Select
          aria-label="Overlay"
          title={
            canOverlay ? 'Overlay another series' : 'Nothing to overlay here'
          }
          value={canOverlay ? overlay : 'none'}
          disabled={!canOverlay}
          onChange={(e) => setOverlay?.(e.target.value)}
          // @tailwindcss/forms pads selects vertically; at this height that
          // pushes the text out of the bottom.
          className="!h-8 w-36 shrink-0 !py-0 !pl-3 !pr-8 !text-xs disabled:opacity-50 sm:w-48"
        >
          <option value="none">No overlay</option>
          {overlayChoices.map((c) => (
            <option key={c.key} value={c.key}>
              Overlay: {c.label}
            </option>
          ))}
        </Select>
      </Row>
      <StatsChart
        series={series}
        pct={metric.pct}
        ariaLabel={`${metric.label}, ${view.label}`}
      />
      <ChartLegend series={series}>
        {overlaySeries.length > 0 && compare !== 'none' && (
          <span className="text-ink-400">
            (comparison hidden while overlaying)
          </span>
        )}
      </ChartLegend>
      {metric.note && <div className="text-ink-500 text-sm">{metric.note}</div>}
      {children}
    </Col>
  )
}
