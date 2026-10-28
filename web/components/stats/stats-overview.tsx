import clsx from 'clsx'
import { countBy, maxBy } from 'lodash'

import { STATS_RANGES } from 'common/stats-window'
import { Col } from 'web/components/layout/col'
import { ActivitySection, STATS_SECTIONS } from './activity-metrics'
import { Sparkline } from './sparkline'
import {
  formatMetricValue,
  getMetricGlance,
  getMetricSummary,
  StatMetric,
} from './stat-metric'
import { MONTHS } from './stats-chart'
import { useStatsTime } from './stats-time'

// Every activity metric on one screen, like the old page's scroll of charts:
// its latest day, its 7-day average and how that moved, and its figure and
// trend for the page's range. A row opens that metric's chart.
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
  // to happen, and ID verifications come from iDenfy a day sooner.
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

  return (
    <Col className="gap-2">
      <h2 className="text-ink-900 text-lg font-semibold">At a glance</h2>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-ink-200 text-ink-600 border-b text-left align-bottom">
              <th className="py-2 pr-2 font-medium">Metric</th>
              <th
                className="px-2 py-2 text-right font-medium"
                title="The most recent day with data (LA time)"
              >
                Latest
                {commonDay && (
                  <div className="text-ink-400 text-[11px] font-normal">
                    {formatDay(commonDay)}
                  </div>
                )}
              </th>
              <th
                className="px-2 py-2 text-right font-medium"
                title="The average of the 7 days to the latest, and its change from the 7 days before"
              >
                7-day avg
              </th>
              <th className="px-2 py-2 text-right font-medium">{rangeLabel}</th>
              <th className="hidden py-2 pl-3 font-medium sm:table-cell">
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr key={g.key}>
                <th
                  colSpan={5}
                  className="text-ink-500 pb-1 pt-4 text-left text-xs font-semibold uppercase tracking-wide"
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
                  return (
                    <tr
                      key={`${section}/${metric.key}`}
                      onClick={() => onSelect(section, metric.key)}
                      className={clsx(
                        'border-ink-100 text-ink-800 cursor-pointer border-b',
                        isSelected ? 'bg-primary-50' : 'hover:bg-canvas-50'
                      )}
                    >
                      <td className="max-w-[8rem] truncate py-2 pr-2 sm:max-w-none">
                        {/* Focusable, so a keyboard can open the chart too;
                            its click reaches the row. */}
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          className="hover:text-primary-700 truncate text-left"
                        >
                          {metric.label}
                        </button>
                      </td>
                      <td className="px-2 py-2 text-right font-medium">
                        {glance
                          ? formatMetricValue(metric, glance.latest.y)
                          : '—'}
                        {glance && glance.latest.x !== commonDay && (
                          <div className="text-ink-400 text-[11px] font-normal">
                            {formatDay(glance.latest.x)}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {glance?.weekAvg === undefined
                          ? '—'
                          : formatMetricValue(metric, glance.weekAvg)}
                        {glance?.change && (
                          <div
                            className={clsx(
                              'text-[11px]',
                              glance.change.direction === 'up'
                                ? 'text-teal-600'
                                : glance.change.direction === 'down'
                                ? 'text-scarlet-600'
                                : 'text-ink-500'
                            )}
                          >
                            {glance.change.text}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {summary.value === undefined
                          ? '—'
                          : formatMetricValue(metric, summary.value)}
                        <div className="text-ink-400 text-[11px] leading-tight">
                          {summary.label}
                        </div>
                      </td>
                      <td className="hidden py-2 pl-3 sm:table-cell">
                        <Sparkline
                          values={summary.spark}
                          className="text-ink-400 h-5 w-20"
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

const formatDay = (day: string) => {
  const [, m, d] = day.split('-')
  return `${MONTHS[+m - 1]} ${+d}`
}
