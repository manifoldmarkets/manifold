import clsx from 'clsx'

import { Row } from 'web/components/layout/row'
import { Sparkline } from './sparkline'
import { formatMetricValue, getMetricHeadline, StatMetric } from './stat-metric'

const SPARKLINE_DAYS = 30

export function MetricTile(props: {
  metric: StatMetric
  selected: boolean
  onSelect: () => void
}) {
  const { metric, selected, onSelect } = props
  const { view, latest, change } = getMetricHeadline(metric)
  const spark = view.values.slice(-SPARKLINE_DAYS).map((p) => p.y)

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={clsx(
        'bg-canvas-0 flex min-w-0 flex-col gap-1 rounded-lg p-3 text-left ring-1 transition-shadow',
        selected
          ? 'ring-primary-500 ring-2'
          : 'ring-ink-200 hover:ring-primary-300'
      )}
    >
      <span className="text-ink-600 truncate text-xs font-medium">
        {metric.label}
      </span>
      <Row className="items-end justify-between gap-2">
        <span className="text-ink-900 text-xl font-semibold tabular-nums">
          {latest ? formatMetricValue(metric, latest.y) : '—'}
        </span>
        <Sparkline
          values={spark}
          className={clsx(
            'mb-1 h-6 w-14 shrink-0',
            selected ? 'text-primary-500' : 'text-ink-400'
          )}
        />
      </Row>
      <span className="text-ink-400 truncate text-[11px]">
        {view.label}
        {change && (
          <>
            {' · '}
            <span
              title={`${change.text} vs 7 days earlier`}
              className={clsx(
                'font-medium',
                change.direction === 'up'
                  ? 'text-teal-600'
                  : change.direction === 'down'
                  ? 'text-scarlet-600'
                  : 'text-ink-500'
              )}
            >
              {change.text}
            </span>
          </>
        )}
      </span>
    </button>
  )
}
