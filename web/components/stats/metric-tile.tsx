import clsx from 'clsx'

import { Row } from 'web/components/layout/row'
import { Sparkline } from './sparkline'
import {
  compareText,
  formatMetricValue,
  getMetricSummary,
  missingDaysText,
  StatMetric,
} from './stat-metric'
import { useStatsTime } from './stats-time'

// Every tile is the same height, so an empty grid slot can hold its place.
// It fits a two-line label: "Total since Dec 17 ’21 · 3d missing" wraps on a
// phone, and the part that says what's missing mustn't be cut off.
export const METRIC_TILE_CLASS = 'h-[6.5rem]'

export function MetricTile(props: {
  metric: StatMetric
  selected: boolean
  onSelect: () => void
  className?: string
}) {
  const { metric, selected, onSelect, className } = props
  const { range, compare } = useStatsTime()
  const { label, value, change, missingDays, spark } = getMetricSummary(
    metric,
    range,
    compare
  )

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={(e) => {
        onSelect()
        // In the phone strip, bring a half-hidden tile fully into view.
        e.currentTarget.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        })
      }}
      className={clsx(
        METRIC_TILE_CLASS,
        'bg-canvas-0 flex min-w-0 flex-col gap-1 rounded-lg p-3 text-left ring-1 transition-shadow',
        selected
          ? 'ring-primary-500 ring-2'
          : 'ring-ink-200 hover:ring-primary-300',
        className
      )}
    >
      <span className="text-ink-600 truncate text-xs font-medium">
        {metric.label}
      </span>
      <Row className="items-end justify-between gap-2">
        <span className="text-ink-900 text-xl font-semibold tabular-nums">
          {value === undefined ? '—' : formatMetricValue(metric, value)}
        </span>
        <Sparkline
          values={spark}
          className={clsx(
            'mb-1 h-6 w-14 shrink-0',
            selected ? 'text-primary-500' : 'text-ink-400'
          )}
        />
      </Row>
      <span
        className="text-ink-400 line-clamp-2 text-[11px] leading-tight"
        title={
          missingDays > 0
            ? `${label}, ${missingDaysText(missingDays)}`
            : undefined
        }
      >
        {label}
        {missingDays > 0 && ` · ${missingDays}d missing`}
        {change && (
          <>
            {' · '}
            <span
              title={`${change.text} ${compareText(range, compare)}`}
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
