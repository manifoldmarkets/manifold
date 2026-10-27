import dayjs from 'dayjs'
import { sumBy } from 'lodash'
import { useState } from 'react'

import {
  STAT_SURFACE_DEFINITIONS,
  StatSurface,
  SurfaceFunnelDay,
  parseSurfaceFunnels,
} from 'common/stat-surfaces'
import { getStatsWindow, sliceWindow, StatsWindow } from 'common/stats-window'
import { filterDefined } from 'common/util/array'
import { formatPercent, formatWithCommas } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { StatMetric, WindowSummary } from './stat-metric'
import { useStatsTime } from './stats-time'
import { Point, rollingAvg, rollingRatio } from './stats-series'

export type FunnelDay = SurfaceFunnelDay & { date: string }

type CountKey = 'pillUsers' | 'visitors' | 'trades'
type RateKey = 'tradedHere' | 'pillTraded' | 'tradedAnywhere'

// Rows from the admin-only get-surface-funnels endpoint.
export const getFunnelDays = (
  rows: { date: string; funnels: unknown }[],
  surface: StatSurface
): FunnelDay[] =>
  filterDefined(
    rows.map((row) => {
      const day = parseSurfaceFunnels(row.funnels)?.[surface]
      return day && { date: row.date, ...day }
    })
  )

const countViews = (days: FunnelDay[], key: CountKey) => {
  const values: Point[] = days.flatMap((d) => {
    const y = d[key]
    return y == null ? [] : [{ x: d.date, y }]
  })
  return [
    { key: 'daily', label: 'Daily', values },
    { key: '7d', label: '7d avg', values: rollingAvg(values, 7) },
  ]
}

const rateViews = (
  days: FunnelDay[],
  num: RateKey,
  den: 'visitors' | 'pillUsers'
) => {
  const daily: Point[] = days.flatMap((d) => {
    const n = d[num]
    return n == null || d[den] <= 0 ? [] : [{ x: d.date, y: n / d[den] }]
  })
  return [
    { key: 'daily', label: 'Daily', values: daily },
    {
      key: '7d',
      label: '7d',
      values: rollingRatio(
        days.map((d) => ({ x: d.date, num: d[num], den: d[den] })),
        7
      ),
    },
  ]
}

// A rate over a range: the summed numerators over the summed denominators of
// its tracked days, so busy days weigh more than quiet ones.
const rateSummary =
  (days: FunnelDay[], num: RateKey, den: 'visitors' | 'pillUsers') =>
  (window: StatsWindow): WindowSummary | undefined => {
    const inRange = sliceWindow(
      days.map((d) => ({ ...d, x: d.date })),
      window
    ).filter((d) => d[num] != null)
    const denominator = sumBy(inRange, (d) => d[den])
    if (denominator <= 0) return undefined
    const value = sumBy(inRange, (d) => d[num] ?? 0) / denominator
    return Number.isFinite(value) ? { value, days: inRange.length } : undefined
  }

export function getSurfaceFunnelMetrics(
  days: FunnelDay[],
  surface: StatSurface
): StatMetric[] {
  const { label } = STAT_SURFACE_DEFINITIONS[surface]
  const firstTracked = days.find((d) => d.trades != null)?.date
  const trackingNote = firstTracked
    ? `Trades on ${label} pages are counted from ${dayjs(firstTracked).format(
        'MMM D, YYYY'
      )}; that first day is partial.`
    : `Trades on ${label} pages aren't counted yet.`

  return [
    {
      key: 'pill-clicks',
      label: 'Pill clicks',
      description: `Signed-in users who clicked the ${label} pill on the home page.`,
      views: countViews(days, 'pillUsers'),
      defaultView: '7d',
    },
    {
      key: 'visitors',
      label: 'Visitors',
      description: `Signed-in users who opened a ${label} page.`,
      views: countViews(days, 'visitors'),
      defaultView: '7d',
    },
    {
      key: 'traded-here',
      label: 'Traded on page',
      description: `Share of visitors who traded on a ${label} page.`,
      pct: true,
      views: rateViews(days, 'tradedHere', 'visitors'),
      defaultView: '7d',
      summary: rateSummary(days, 'tradedHere', 'visitors'),
      note: trackingNote,
    },
    {
      key: 'pill-traded',
      label: 'Pill → trade',
      description: `Share of pill clickers who then traded on a ${label} page.`,
      pct: true,
      views: rateViews(days, 'pillTraded', 'pillUsers'),
      defaultView: '7d',
      summary: rateSummary(days, 'pillTraded', 'pillUsers'),
      note: trackingNote,
    },
    {
      key: 'trades',
      label: 'Trades on page',
      description: `Bets, sells, limit orders and perp orders placed on ${label} pages.`,
      views: countViews(days, 'trades'),
      defaultView: '7d',
      summary: { kind: 'sum' },
      note: trackingNote,
    },
    {
      key: 'traded-anywhere',
      label: 'Traded anywhere',
      description:
        'Share of visitors who placed any trade on the site that day, on this page or elsewhere.',
      pct: true,
      views: rateViews(days, 'tradedAnywhere', 'visitors'),
      defaultView: '7d',
      summary: rateSummary(days, 'tradedAnywhere', 'visitors'),
    },
  ]
}

const TABLE_DAYS = 14

const rate = (num: number | null, den: number) =>
  num == null || den <= 0 ? '—' : formatPercent(num / den)
const count = (n: number | null) => (n == null ? '—' : formatWithCommas(n))

// The selected range's days, newest first.
export function SurfaceFunnelTable(props: { days: FunnelDay[] }) {
  const { range } = useStatsTime()
  const [showAll, setShowAll] = useState(false)
  const lastDay = props.days[props.days.length - 1]?.date
  const inRange = lastDay
    ? sliceWindow(
        props.days.map((d) => ({ ...d, x: d.date })),
        getStatsWindow(lastDay, range)
      ).reverse()
    : []
  const rows = showAll ? inRange : inRange.slice(0, TABLE_DAYS)
  const headers = [
    'Day',
    'Pill clicks',
    'Visitors',
    'Traded here',
    'Rate',
    'Trades',
    'Pill → trade',
    'Traded anywhere',
  ]

  return (
    <Col className="bg-canvas-0 ring-ink-200 gap-2 rounded-lg p-4 ring-1">
      <h2 className="text-ink-900 text-lg font-semibold">By day</h2>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[40rem] text-sm tabular-nums">
          <thead>
            <tr className="border-ink-200 text-ink-600 border-b">
              {headers.map((h, i) => (
                <th
                  key={h}
                  className={
                    i === 0
                      ? 'py-2 pr-3 text-left font-medium'
                      : 'px-3 py-2 text-right font-medium'
                  }
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr
                key={d.date}
                className="border-ink-100 text-ink-800 border-b last:border-0"
              >
                <td className="text-ink-600 whitespace-nowrap py-2 pr-3">
                  {dayjs(d.date).format('ddd MMM D')}
                </td>
                <td className="px-3 py-2 text-right">{count(d.pillUsers)}</td>
                <td className="px-3 py-2 text-right">{count(d.visitors)}</td>
                <td className="px-3 py-2 text-right">{count(d.tradedHere)}</td>
                <td className="px-3 py-2 text-right font-medium">
                  {rate(d.tradedHere, d.visitors)}
                </td>
                <td className="px-3 py-2 text-right">{count(d.trades)}</td>
                <td className="px-3 py-2 text-right">
                  {rate(d.pillTraded, d.pillUsers)}
                </td>
                <td className="px-3 py-2 text-right">
                  {rate(d.tradedAnywhere, d.visitors)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {inRange.length > TABLE_DAYS && (
        <Button
          color="gray-white"
          size="xs"
          className="self-start"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Show fewer' : `Show all ${inRange.length} days`}
        </Button>
      )}
    </Col>
  )
}
