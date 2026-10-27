import { ReactNode } from 'react'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Select } from 'web/components/widgets/select'
import { buildChartSeries, getView, StatMetric } from './stat-metric'
import { StatsChart } from './stats-chart'
import { Point } from './stats-series'
import { useStatsTime } from './stats-time'

export type OverlaySeries = { key: string; label: string; values: Point[] }

// The selected metric's chart, with a switcher between its views and an
// optional overlay of other series on the same axis.
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

  return (
    <Col className="bg-canvas-0 ring-ink-200 gap-3 rounded-lg p-4 ring-1">
      <Row className="flex-wrap items-start justify-between gap-2">
        <Col className="min-w-0">
          <h2 className="text-ink-900 text-lg font-semibold">{metric.label}</h2>
          <p className="text-ink-500 text-sm">{metric.description}</p>
        </Col>
        <Row className="flex-wrap items-center gap-2">
          {metric.views.length > 1 && (
            <ChoicesToggleGroup
              ariaLabel={`${metric.label} view`}
              currentChoice={view.key}
              choicesMap={Object.fromEntries(
                metric.views.map((v) => [v.label, v.key])
              )}
              setChoice={(key) => setViewKey(String(key))}
              color="gray"
              className="max-w-full flex-wrap"
              toggleClassName="!px-2.5 !py-1 text-xs"
            />
          )}
          {overlayChoices.length > 0 && setOverlay && (
            <Select
              aria-label="Overlay"
              value={overlay}
              onChange={(e) => setOverlay(e.target.value)}
              className="!h-8 !pl-3 !pr-8 !text-xs"
            >
              <option value="none">No overlay</option>
              {overlayChoices.map((c) => (
                <option key={c.key} value={c.key}>
                  Overlay: {c.label}
                </option>
              ))}
            </Select>
          )}
        </Row>
      </Row>
      <StatsChart
        series={series}
        pct={metric.pct}
        ariaLabel={`${metric.label}, ${view.label}`}
      />
      {series.length > 1 && (
        <Row className="flex-wrap gap-x-4 gap-y-1 text-xs">
          {series.map((s) => (
            <Row key={s.key} className="items-center gap-1.5">
              <span
                className="h-0.5 w-4"
                style={{
                  background: s.dashed
                    ? `repeating-linear-gradient(90deg, ${s.color} 0 3px, transparent 3px 5px)`
                    : s.color,
                }}
              />
              <span className="text-ink-600">{s.label}</span>
            </Row>
          ))}
          {overlaySeries.length > 0 && compare !== 'none' && (
            <span className="text-ink-400">
              (comparison hidden while overlaying)
            </span>
          )}
        </Row>
      )}
      {metric.note && <div className="text-ink-500 text-sm">{metric.note}</div>}
      {children}
    </Col>
  )
}
