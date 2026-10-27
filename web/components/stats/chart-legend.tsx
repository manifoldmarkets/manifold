import { ReactNode } from 'react'

import { Row } from 'web/components/layout/row'
import { StatsChartSeries } from './stats-chart'

// A chart's line swatches and labels. Always one row tall at least, so the
// chart doesn't move when a comparison or overlay adds a line.
export function ChartLegend(props: {
  series: Pick<StatsChartSeries, 'key' | 'label' | 'color' | 'dashed'>[]
  children?: ReactNode
}) {
  return (
    <Row className="min-h-[1rem] flex-wrap gap-x-4 gap-y-1 text-xs">
      {props.series.map((s) => (
        <Row key={s.key} className="min-w-0 items-center gap-1.5">
          <span
            className="h-0.5 w-4 shrink-0"
            style={{
              background: s.dashed
                ? `repeating-linear-gradient(90deg, ${s.color} 0 3px, transparent 3px 5px)`
                : s.color,
            }}
          />
          <span className="text-ink-600 truncate">{s.label}</span>
        </Row>
      ))}
      {props.children}
    </Row>
  )
}
