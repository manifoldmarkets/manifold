import clsx from 'clsx'
import { countBy, maxBy, sortBy } from 'lodash'

import {
  MIN_SIGNAL_WEEKS,
  signalDirection,
  StatSignal,
} from 'common/stat-signals'
import { STATS_RANGES } from 'common/stats-window'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ActivitySection, STATS_SECTIONS } from './activity-metrics'
import { SignalBadge } from './quick-figures'
import { Sparkline } from './sparkline'
import {
  changeTone,
  describeSignal,
  formatMetricValue,
  formatShortDay,
  getMetricGlance,
  getMetricSummary,
  missingDaysText,
  StatMetric,
  TONE_TEXT,
} from './stat-metric'
import { useStatsTime } from './stats-time'

// Weeks of trend line per row: enough to see a recent turn.
const TREND_WEEKS = 13

// Every activity metric on one screen, like the old page's scroll of charts.
// "Worth a look" picks out the metrics whose latest week is unusual (an
// extreme, a sharp move, a long run up or down), bad news first. Each row
// has the latest day, the 7-day average and its change, the range's figure
// and the last 13 weeks; an unusual row is marked in its color. A row opens
// that metric's chart.
export function StatsOverview(props: {
  metrics: Record<ActivitySection, StatMetric[]>
  selected: { section: string; metric?: string }
  onSelect: (section: ActivitySection, metricKey: string) => void
}) {
  const { metrics, selected, onSelect } = props
  const { range, compare } = useStatsTime()
  const groups = STATS_SECTIONS.flatMap((s) =>
    s.key in metrics
      ? [{ ...s, metrics: metrics[s.key as ActivitySection] }]
      : []
  )
  const rows = groups.flatMap((g) =>
    g.metrics.map((m) => ({
      section: g.key as ActivitySection,
      metric: m,
      glance: getMetricGlance(m),
      summary: getMetricSummary(m, range, compare),
    }))
  )
  // The latest day most metrics share, for the column header. A metric whose
  // latest day differs shows its own date: D1 retention needs the next day
  // to happen.
  const commonDay = maxBy(
    Object.entries(
      countBy(rows.flatMap((r) => (r.glance ? [r.glance.latest.x] : [])))
    ),
    ([, n]) => n
  )?.[0]
  const rangeLabel =
    range === 'all'
      ? 'All data'
      : STATS_RANGES.find((r) => r.key === range)?.label

  const flagged = sortBy(
    rows.flatMap((r) =>
      r.glance?.signal ? [{ ...r, signal: r.glance.signal }] : []
    ),
    (r) => (signalTone(r.signal) === 'bad' ? 0 : 1),
    (r) => SIGNAL_ORDER.indexOf(r.signal.kind)
  )
  // Metrics with enough complete weeks to judge at all: a gap can leave a
  // metric unjudged, and "nothing unusual" mustn't cover it.
  const judged = rows.filter(
    (r) => (r.glance?.weeks.length ?? 0) >= MIN_SIGNAL_WEEKS
  ).length
  const unjudged = rows.length - judged

  return (
    <Col className="gap-3">
      <h2 className="text-ink-900 text-lg font-semibold">At a glance</h2>

      <Col className="gap-1.5">
        <div className="text-ink-600 text-sm font-medium">Worth a look</div>
        {flagged.length === 0 ? (
          <p className="text-ink-500 text-sm">
            {judged === 0
              ? 'Not enough complete weeks yet to judge the latest one.'
              : unjudged === 0
              ? 'Nothing unusual in the latest week.'
              : `Nothing unusual among the ${judged} of ${rows.length} metrics with enough complete weeks to judge.`}
          </p>
        ) : (
          // Phones: one swipeable row. Wider: wrapped.
          <Row className="scrollbar-hide -mx-4 gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {flagged.map(({ section, metric, signal, glance }) => (
              <button
                key={`${section}/${metric.key}`}
                type="button"
                onClick={() => onSelect(section, metric.key)}
                title={describeSignal(signal).long}
                className="bg-canvas-0 ring-ink-200 hover:ring-primary-300 my-px flex max-w-full shrink-0 flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left ring-1"
              >
                <span className="text-ink-900 text-sm font-medium">
                  {metric.label}
                </span>
                <Row className="min-w-0 items-center gap-1.5">
                  <SignalBadge signal={signal} />
                  {glance?.change && (
                    <span
                      className={clsx(
                        'text-[11px] tabular-nums',
                        TONE_TEXT[changeTone(glance.change.direction)]
                      )}
                    >
                      {glance.change.text} wk
                    </span>
                  )}
                </Row>
              </button>
            ))}
          </Row>
        )}
        {flagged.length > 0 && unjudged > 0 && (
          <p className="text-ink-400 text-xs">
            {unjudged === 1 ? '1 metric lacks' : `${unjudged} metrics lack`}{' '}
            enough complete weeks to judge.
          </p>
        )}
      </Col>

      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-ink-200 text-ink-600 border-b text-left align-bottom text-xs">
              <th className="py-1.5 pl-2 pr-2 font-medium">Metric</th>
              <th
                className="px-2 py-1.5 text-right font-medium"
                title="The most recent day with data (LA time)"
              >
                {commonDay ? formatShortDay(commonDay) : 'Latest'}
              </th>
              <th
                className="px-2 py-1.5 text-right font-medium"
                title="The average of the 7 days to the latest, and its change from the 7 days before"
              >
                7-day avg
              </th>
              <th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">
                {rangeLabel}
              </th>
              <th
                className="py-1.5 pl-2 font-medium"
                title={`Weekly averages over the last ${TREND_WEEKS} weeks`}
              >
                {TREND_WEEKS} wks
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr key={g.key}>
                <th
                  colSpan={5}
                  className="text-ink-500 pb-0.5 pl-2 pt-3 text-left text-[11px] font-semibold uppercase tracking-wide"
                >
                  {g.label}
                </th>
              </tr>,
              ...rows
                .filter((r) => r.section === g.key)
                .map(({ section, metric, glance, summary }) => {
                  const isSelected =
                    selected.section === section &&
                    selected.metric === metric.key
                  const signal = glance?.signal
                  const tone = signal ? signalTone(signal) : undefined
                  return (
                    <tr
                      key={`${section}/${metric.key}`}
                      onClick={() => onSelect(section, metric.key)}
                      className={clsx(
                        'border-ink-100 text-ink-800 cursor-pointer border-b',
                        isSelected ? 'bg-primary-50' : 'hover:bg-canvas-50'
                      )}
                    >
                      <td
                        className={clsx(
                          'max-w-[9rem] border-l-2 py-1.5 pl-2 pr-2 sm:max-w-none',
                          tone === 'good'
                            ? 'border-teal-500'
                            : tone === 'bad'
                            ? 'border-scarlet-500'
                            : 'border-transparent'
                        )}
                      >
                        {/* Focusable, so a keyboard can open the chart too;
                            its click reaches the row. */}
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          className="hover:text-primary-700 block max-w-full truncate text-left"
                        >
                          {metric.label}
                        </button>
                        {signal && (
                          <div
                            className={clsx(
                              'truncate text-[11px]',
                              tone && TONE_TEXT[tone]
                            )}
                            title={describeSignal(signal).long}
                          >
                            {describeSignal(signal).short}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {glance
                          ? formatMetricValue(metric, glance.latest.y)
                          : '—'}
                        {glance && glance.latest.x !== commonDay && (
                          <span className="text-ink-400 ml-1 whitespace-nowrap text-[11px]">
                            {formatShortDay(glance.latest.x)}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="font-medium">
                          {glance?.weekAvg === undefined
                            ? '—'
                            : formatMetricValue(metric, glance.weekAvg)}
                        </span>
                        {glance?.change ? (
                          <span
                            className={clsx(
                              'ml-1 whitespace-nowrap text-[11px]',
                              TONE_TEXT[changeTone(glance.change.direction)]
                            )}
                          >
                            {glance.change.text}
                          </span>
                        ) : (
                          glance &&
                          glance.weekDays < 7 && (
                            <span className="text-ink-400 ml-1 whitespace-nowrap text-[11px]">
                              {glance.weekDays}/7 days
                            </span>
                          )
                        )}
                      </td>
                      <td className="hidden px-2 py-1.5 text-right sm:table-cell">
                        {summary.value === undefined
                          ? '—'
                          : formatMetricValue(metric, summary.value)}
                        <span
                          className="text-ink-400 ml-1.5 text-[11px]"
                          title={
                            summary.missingDays > 0
                              ? `${summary.label}, ${missingDaysText(
                                  summary.missingDays
                                )}`
                              : undefined
                          }
                        >
                          {summary.label.charAt(0).toLowerCase() +
                            summary.label.slice(1)}
                          {summary.missingDays > 0 &&
                            ` · ${summary.missingDays}d missing`}
                        </span>
                      </td>
                      <td
                        className="py-1.5 pl-2"
                        title={
                          glance && glance.weeks.length < TREND_WEEKS
                            ? `${glance.weeks.length} complete week${
                                glance.weeks.length === 1 ? '' : 's'
                              }`
                            : undefined
                        }
                      >
                        <Sparkline
                          slots={TREND_WEEKS}
                          values={(glance?.weeks ?? [])
                            .slice(0, TREND_WEEKS)
                            .map((w) => w.mean)
                            .reverse()}
                          className={clsx(
                            'h-5 w-12 sm:w-20',
                            tone ? TONE_TEXT[tone] : 'text-ink-400'
                          )}
                        />
                      </td>
                    </tr>
                  )
                }),
            ])}
          </tbody>
        </table>
      </div>
    </Col>
  )
}

// Most significant first, within good or bad news.
const SIGNAL_ORDER: StatSignal['kind'][] = [
  'low',
  'high',
  'drop',
  'jump',
  'falling',
  'rising',
]

const signalTone = (signal: StatSignal) => changeTone(signalDirection(signal))
