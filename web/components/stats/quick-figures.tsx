import clsx from 'clsx'

import { signalDirection, StatSignal } from 'common/stat-signals'
import {
  changeTone,
  describeSignal,
  formatMetricValue,
  formatShortDay,
  MetricGlance,
  StatMetric,
  TONE_TEXT,
} from './stat-metric'

// The figures that say at once how a metric is doing, above its chart: the
// latest day, the 7-day average against the week before, and against the
// same week a year earlier. One fixed-height row, so the chart below doesn't
// move from metric to metric.
export function QuickFigures(props: {
  metric: StatMetric
  glance: MetricGlance | undefined
}) {
  const { metric, glance } = props
  const value = (y: number | undefined) =>
    y === undefined ? '—' : formatMetricValue(metric, y)
  return (
    <div className="grid h-12 grid-cols-3 gap-2 text-left tabular-nums">
      <Figure
        label={glance ? formatShortDay(glance.latest.x) : 'Latest'}
        title="The most recent day with data (LA time)"
        value={value(glance?.latest.y)}
      />
      <Figure
        label="7-day avg"
        title="The average of the 7 days to the latest day, and its change from the 7 days before"
        value={value(glance?.weekAvg)}
        note={
          glance?.change
            ? {
                text: `${glance.change.text} vs prior week`,
                tone: changeTone(glance.change.direction),
              }
            : glance && glance.weekDays < 7
            ? { text: `${glance.weekDays} of 7 days`, tone: 'neutral' }
            : undefined
        }
      />
      <Figure
        label="vs a year ago"
        title="This 7-day average against the same 7 days 52 weeks earlier"
        value={glance?.yearChange?.text ?? '—'}
        valueTone={
          glance?.yearChange
            ? changeTone(glance.yearChange.direction)
            : undefined
        }
        note={
          glance?.yearChange && glance.yearAgoAvg !== undefined
            ? { text: `was ${value(glance.yearAgoAvg)}`, tone: 'neutral' }
            : undefined
        }
      />
    </div>
  )
}

function Figure(props: {
  label: string
  title: string
  value: string
  valueTone?: keyof typeof TONE_TEXT
  note?: { text: string; tone: keyof typeof TONE_TEXT }
}) {
  const { label, title, value, valueTone, note } = props
  return (
    <div className="min-w-0" title={title}>
      <div className="text-ink-500 truncate text-[11px]">{label}</div>
      <div
        className={clsx(
          'truncate text-base font-semibold leading-tight',
          valueTone ? TONE_TEXT[valueTone] : 'text-ink-900'
        )}
      >
        {value}
      </div>
      {note && (
        <div className={clsx('truncate text-[11px]', TONE_TEXT[note.tone])}>
          {note.text}
        </div>
      )}
    </div>
  )
}

// A pill naming what's unusual about the latest week, colored by whether
// that's good or bad news.
export function SignalBadge(props: { signal: StatSignal; className?: string }) {
  const { signal, className } = props
  const { short, long } = describeSignal(signal)
  const good = changeTone(signalDirection(signal)) === 'good'
  return (
    <span
      title={long}
      className={clsx(
        'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-medium',
        good
          ? 'bg-teal-500/10 text-teal-700'
          : 'bg-scarlet-500/10 text-scarlet-700',
        className
      )}
    >
      <span aria-hidden>{signalDirection(signal) === 'up' ? '▲' : '▼'}</span>
      <span className="truncate">{short}</span>
    </span>
  )
}
