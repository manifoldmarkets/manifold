import { ReactNode } from 'react'

import { DailyChart } from 'web/components/charts/stats'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { getView, StatMetric } from './stat-metric'

// The selected metric's chart, with a switcher between its views.
export function MetricChartPanel(props: {
  metric: StatMetric
  viewKey?: string
  setViewKey: (key: string) => void
  children?: ReactNode
}) {
  const { metric, viewKey, setViewKey, children } = props
  const view = getView(metric, viewKey)

  return (
    <Col className="bg-canvas-0 ring-ink-200 gap-3 rounded-lg p-4 ring-1">
      <Row className="flex-wrap items-start justify-between gap-2">
        <Col className="min-w-0">
          <h2 className="text-ink-900 text-lg font-semibold">{metric.label}</h2>
          <p className="text-ink-500 text-sm">{metric.description}</p>
        </Col>
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
      </Row>
      {/* DailyChart draws its y-axis labels and zoom handle badges outside
          its own width, so leave them room inside the card. */}
      <div className="pl-5 sm:pr-14">
        <DailyChart
          key={`${metric.key}-${view.key}`}
          values={view.values}
          pct={metric.pct}
        />
      </div>
      {metric.note && <div className="text-ink-500 text-sm">{metric.note}</div>}
      {children}
    </Col>
  )
}
