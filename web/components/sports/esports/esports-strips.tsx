import { ArrowRightIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { sortBy } from 'lodash'
import {
  esportsPath,
  EsportsEventView,
  EsportsSeries,
  featuredEsportsEvent,
} from 'common/esports'
import { formatPercent } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useEsports } from 'web/hooks/use-esports'
import { track } from 'web/lib/service/analytics'
import { TitleMark } from './esports-marks'

/** One line on where an event stands: its champion, leader or open series. */
export function eventSummary(view: EsportsEventView): string {
  if (view.status === 'finished')
    return view.champion ? `🏆 ${view.champion}` : 'Finished'
  if (view.openSeries.length > 0) return `${view.openSeries.length} series open`
  // The likeliest named team, and only when the field (Other) isn't likelier.
  const lead = view.odds[0]
  if (lead && !lead.isOther)
    return `Top pick: ${lead.text}, ${formatPercent(lead.prob)}`
  return view.status === 'upcoming' ? 'Wide open' : 'In progress'
}

/**
 * The season at a glance: every other tournament, one small card each, in
 * progress first, then what's next, then the latest champions.
 */
export function EsportsSeasonStrip(props: {
  views: EsportsEventView[]
  heading?: string
}) {
  const { views, heading = 'This season' } = props
  if (views.length === 0) return null
  const order = { 'in-progress': 0, upcoming: 1, finished: 2 } as const
  const sorted = sortBy(
    views,
    (v) => order[v.status],
    (v) =>
      v.status === 'finished'
        ? -Date.parse(v.event.endDate)
        : Date.parse(v.event.startDate)
  )
  return (
    <Col className="gap-2">
      <h3 className="text-ink-900 px-1 text-xs font-black uppercase tracking-wider">
        {heading}
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {sorted.map((v) => (
          <Link
            key={v.event.key}
            href={esportsPath(v.event.title)}
            className="bg-canvas-0 border-ink-200 hover:border-ink-400 group relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-xl border p-3 transition-colors"
          >
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-[2px]"
              style={{ backgroundColor: v.title.color }}
            />
            <Row className="items-center gap-1.5">
              <TitleMark title={v.title} />
              <span className="text-ink-500 truncate text-[10px] font-bold uppercase tracking-wider">
                {v.status === 'in-progress'
                  ? 'In progress'
                  : v.status === 'upcoming'
                  ? 'Next up'
                  : 'Final'}
              </span>
            </Row>
            <span className="text-ink-1000 truncate text-sm font-bold">
              {v.event.name}
            </span>
            <span
              className={clsx(
                'truncate text-xs',
                v.status === 'finished' ? 'text-ink-800' : 'text-ink-500'
              )}
            >
              {eventSummary(v)}
            </span>
          </Link>
        ))}
      </div>
    </Col>
  )
}

/**
 * Esports, from the sports feed: the tournament on now and its open series,
 * as one strip under the featured game. It links over rather than mixing
 * series into the day-by-day game list: series have no start times.
 */
export function EsportsBridge() {
  const { events } = useEsports(false)
  const view = featuredEsportsEvent(events ?? [])
  if (!view || view.status !== 'in-progress' || view.openSeries.length === 0)
    return null
  const { swiss } = view
  const round = swiss && !swiss.standings.complete ? swiss.standings.round : 0
  const deciders = swiss?.standings.pending.filter(
    (p) => p.stakes === 'decider'
  ).length
  const series = view.openSeries.slice(0, 3)
  const allDeciders = !!deciders && deciders === view.openSeries.length
  const stage = round
    ? `Swiss round ${round}${allDeciders ? ` · ${deciders} deciders` : ''}`
    : `${view.openSeries.length} series open`
  const shortStage = round
    ? `Round ${round}${allDeciders ? ' deciders' : ''}`
    : `${view.openSeries.length} open`

  return (
    <Col className="border-ink-200 bg-canvas-0 overflow-hidden rounded-xl border">
      <Link
        href={`${esportsPath()}#event-${view.event.key}`}
        onClick={() => track('esports bridge click', { event: view.event.key })}
        className="relative isolate flex items-center gap-2 overflow-hidden bg-[#0b0f17] px-3 py-2 text-white"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -left-10 -top-16 -z-10 h-32 w-48 rounded-full opacity-40 blur-2xl"
          style={{ backgroundColor: view.title.color }}
        />
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/60">
          Esports
        </span>
        <TitleMark title={view.title} />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          {view.event.name}
          <span className="font-medium text-white/60">
            {' · '}
            <span className="sm:hidden">{shortStage}</span>
            <span className="hidden sm:inline">{stage}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-white/80">
          <span className="hidden sm:inline">All esports</span>
          <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
        </span>
      </Link>
      <div
        className="divide-ink-100 grid divide-x"
        style={{
          gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))`,
        }}
      >
        {series.map((s) => (
          <MiniSeries key={s.answerId} series={s} color={view.title.color} />
        ))}
      </div>
    </Col>
  )
}

/**
 * Two teams pulling on one bar: the series' price at a glance. Narrow enough
 * that three sit side by side on a phone.
 */
function MiniSeries(props: { series: EsportsSeries; color: string }) {
  const { series, color } = props
  const a = Math.round(series.prob * 100)
  const side = (s: 'a' | 'b', pct: number, align: string) => (
    <span
      className={clsx(
        'flex min-w-0 flex-col leading-tight',
        align,
        pct >= 50 ? 'text-ink-1000' : 'text-ink-500'
      )}
    >
      <span className="truncate text-[13px] font-black tracking-tight">
        {series[s].code}
      </span>
      <span className="text-xs font-semibold tabular-nums">{pct}%</span>
    </span>
  )
  return (
    <Link
      href={`${esportsPath()}#series-${series.answerId}`}
      className="hover:bg-canvas-50 flex min-w-0 flex-col gap-1.5 px-3 py-2.5"
      aria-label={`${series.a.name} ${a}%, ${series.b.name} ${100 - a}%`}
    >
      <Row className="items-end justify-between gap-1">
        {side('a', a, 'items-start')}
        {side('b', 100 - a, 'items-end text-right')}
      </Row>
      <div className="bg-ink-200 flex h-1.5 overflow-hidden rounded-full">
        <div
          className="h-full rounded-l-full"
          style={{ width: `${a}%`, backgroundColor: color }}
        />
      </div>
    </Link>
  )
}
