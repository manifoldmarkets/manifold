import clsx from 'clsx'
import { scaleLinear } from 'd3-scale'
import { line, area } from 'd3-shape'
import { uniq } from 'lodash'
import { useEffect, useMemo, useRef, useState } from 'react'

import { fromDayNumber, toDayNumber } from 'common/stats-window'
import { formatLargeNumber, formatPercent } from 'common/util/format'
import { SizedContainer } from 'web/components/sized-container'
import { formatCount } from './stats-series'

export type StatsChartSeries = {
  key: string
  label: string
  color: string
  points: { x: string; y: number }[]
  dashed?: boolean
  // A comparison series moved forward onto the current days: how far back its
  // values really are, so the tooltip can show their own dates.
  shiftedDays?: number
}

export const STATS_SERIES_COLORS = [
  '#11b981', // teal: the primary series
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#ec4899', // pink
  '#0ea5e9', // sky
  '#8b5cf6', // violet
]
export const STATS_COMPARE_COLOR = '#94a3b8'

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')
const formatDay = (n: number, withYear = false) => {
  const [y, m, d] = fromDayNumber(n).split('-')
  return `${MONTHS[+m - 1]} ${+d}${withYear ? `, ${y}` : ''}`
}
// Axis labels: "Oct 3" within a year, "Oct ’26" across years.
const formatTick = (n: number, spansYears: boolean) => {
  if (!spansYears) return formatDay(n)
  const [y, m] = fromDayNumber(n).split('-')
  return `${MONTHS[+m - 1]} ’${y.slice(2)}`
}

const formatValue = (y: number, pct: boolean | undefined) =>
  pct ? formatPercent(y) : formatCount(y)

// A line chart of LA-day series with an optional dashed comparison, a hover
// tooltip listing every series on the hovered day, and no zoom: the page's
// time range controls choose the days.
export function StatsChart(props: {
  series: StatsChartSeries[]
  pct?: boolean
  ariaLabel: string
  className?: string
}) {
  const { series, pct, ariaLabel, className } = props
  const hasData = series.some((s) =>
    s.points.some(
      (p) => Number.isFinite(p.y) && Number.isFinite(toDayNumber(p.x))
    )
  )
  if (!hasData)
    return (
      <div
        className={clsx(
          'text-ink-400 flex h-[180px] items-center justify-center text-sm sm:h-[260px]',
          className
        )}
      >
        No data in this range
      </div>
    )
  return (
    <SizedContainer className={clsx('h-[180px] sm:h-[260px]', className)}>
      {(w, h) => (
        <ChartBody
          w={w}
          h={h}
          series={series}
          pct={pct}
          ariaLabel={ariaLabel}
        />
      )}
    </SizedContainer>
  )
}

const MARGIN = { top: 10, right: 52, bottom: 24, left: 4 }

function ChartBody(props: {
  w: number
  h: number
  series: StatsChartSeries[]
  pct?: boolean
  ariaLabel: string
}) {
  const { w, h, series, pct, ariaLabel } = props
  const plotW = Math.max(w - MARGIN.left - MARGIN.right, 10)
  const plotH = Math.max(h - MARGIN.top - MARGIN.bottom, 10)
  const [hoverDay, setHoverDay] = useState<number>()
  // A touch tap keeps its tooltip after the finger lifts (a mouse's goes
  // when it leaves); tapping anywhere outside the chart clears it.
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (hoverDay === undefined) return
    const onDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node))
        setHoverDay(undefined)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [hoverDay === undefined])

  const prepared = useMemo(
    () =>
      series.map((s) => {
        const points = s.points
          .map((p) => ({ n: toDayNumber(p.x), y: p.y }))
          .filter((p) => Number.isFinite(p.n) && Number.isFinite(p.y))
          .sort((a, b) => a.n - b.n)
        // Runs of consecutive days. A missing day breaks the line rather than
        // being bridged, since it is unknown, not a value between neighbors.
        const runs: (typeof points)[] = []
        for (const p of points) {
          const run = runs[runs.length - 1]
          if (run && p.n - run[run.length - 1].n === 1) run.push(p)
          else runs.push([p])
        }
        return {
          ...s,
          nPoints: points,
          runs,
          byDay: new Map(points.map((p) => [p.n, p.y])),
        }
      }),
    [series]
  )

  const { xScale, yScale, xTicks, yTicks, spansYears } = useMemo(() => {
    const all = prepared.flatMap((s) => s.nPoints)
    const days = all.map((p) => p.n)
    const ys = all.map((p) => p.y)
    const xMin = Math.min(...days)
    const xMax = Math.max(...days, xMin + 1)
    const yMin = Math.min(0, ...ys)
    const yMax = Math.max(...ys, yMin + (pct ? 0.01 : 1))
    const xScale = scaleLinear([xMin, xMax], [0, plotW])
    const yScale = scaleLinear([yMin, yMax], [plotH, 0]).nice(4)
    const xTicks = uniq(
      xScale.ticks(Math.max(2, Math.floor(plotW / 90))).map(Math.round)
    ).filter((n) => n >= xMin && n <= xMax)
    return {
      xScale,
      yScale,
      xTicks,
      yTicks: yScale.ticks(4),
      spansYears: xMax - xMin > 300,
    }
  }, [prepared, plotW, plotH, pct])

  const linePath = line<{ n: number; y: number }>()
    .x((p) => xScale(p.n))
    .y((p) => yScale(p.y))
  // Shade under the line only when there's a single solid series; under one of
  // several it reads as that series being special.
  const solid = prepared.filter((s) => !s.dashed)
  const primary = solid.length === 1 ? solid[0] : undefined
  const areaPath = area<{ n: number; y: number }>()
    .x((p) => xScale(p.n))
    .y0(yScale(Math.max(0, yScale.domain()[0])))
    .y1((p) => yScale(p.y))

  const onPointer = (clientX: number, rect: DOMRect) => {
    const [xMin, xMax] = xScale.domain()
    const n = Math.round(xScale.invert(clientX - rect.left - MARGIN.left))
    setHoverDay(Math.min(xMax, Math.max(xMin, n)))
  }

  const hoverX = hoverDay === undefined ? undefined : xScale(hoverDay)
  const tooltipLeft =
    hoverX === undefined
      ? 0
      : hoverX + MARGIN.left > w / 2
      ? hoverX + MARGIN.left - 12
      : hoverX + MARGIN.left + 12

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <svg
        width={w}
        height={h}
        role="img"
        aria-label={ariaLabel}
        className="touch-pan-y select-none"
        onPointerMove={(e) =>
          onPointer(e.clientX, e.currentTarget.getBoundingClientRect())
        }
        onPointerDown={(e) =>
          onPointer(e.clientX, e.currentTarget.getBoundingClientRect())
        }
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setHoverDay(undefined)
        }}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {yTicks.map((t) => (
            <g key={t} transform={`translate(0,${yScale(t)})`}>
              <line x2={plotW} className="stroke-ink-200" strokeWidth={1} />
              <text
                x={plotW + 6}
                dy="0.32em"
                className="fill-ink-500 text-[11px] tabular-nums"
              >
                {pct ? formatPercent(t) : formatLargeNumber(t)}
              </text>
            </g>
          ))}
          {xTicks.map((n) => (
            <text
              key={n}
              x={xScale(n)}
              y={plotH + 16}
              // Keep labels at the edges inside the plot instead of clipped.
              textAnchor={
                xScale(n) < 24
                  ? 'start'
                  : xScale(n) > plotW - 24
                  ? 'end'
                  : 'middle'
              }
              className="fill-ink-500 text-[11px]"
            >
              {formatTick(n, spansYears)}
            </text>
          ))}
          {primary?.runs.map(
            (run, i) =>
              run.length > 1 && (
                <path
                  key={`area-${i}`}
                  d={areaPath(run) ?? undefined}
                  fill={primary.color}
                  opacity={0.12}
                />
              )
          )}
          {prepared.flatMap((s) =>
            s.runs.map((run, i) =>
              run.length === 1 ? (
                <circle
                  key={`${s.key}-${i}`}
                  cx={xScale(run[0].n)}
                  cy={yScale(run[0].y)}
                  r={2.5}
                  fill={s.color}
                />
              ) : (
                <path
                  key={`${s.key}-${i}`}
                  d={linePath(run) ?? undefined}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.dashed ? 1.5 : 2}
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                  strokeLinejoin="round"
                />
              )
            )
          )}
          {hoverX !== undefined && hoverDay !== undefined && (
            <>
              <line
                x1={hoverX}
                x2={hoverX}
                y2={plotH}
                className="stroke-ink-400"
                strokeWidth={1}
              />
              {prepared.map((s) => {
                const y = s.byDay.get(hoverDay)
                return y === undefined ? null : (
                  <circle
                    key={s.key}
                    cx={hoverX}
                    cy={yScale(y)}
                    r={3.5}
                    fill={s.color}
                    className="stroke-canvas-0"
                    strokeWidth={1.5}
                  />
                )
              })}
            </>
          )}
        </g>
      </svg>
      {hoverDay !== undefined && (
        <div
          className={clsx(
            'bg-canvas-0 ring-ink-200 pointer-events-none absolute top-2 z-10 min-w-[9rem] rounded-md px-2.5 py-2 text-xs shadow-md ring-1',
            hoverX !== undefined &&
              hoverX + MARGIN.left > w / 2 &&
              '-translate-x-full'
          )}
          style={{ left: tooltipLeft }}
        >
          <div className="text-ink-900 mb-1 font-semibold">
            {formatDay(hoverDay, true)}
          </div>
          {prepared.map((s) => {
            const y = s.byDay.get(hoverDay)
            return (
              <div key={s.key} className="flex items-center gap-2 py-0.5">
                <span
                  className="h-0.5 w-3 shrink-0"
                  style={{
                    background: s.dashed
                      ? `repeating-linear-gradient(90deg, ${s.color} 0 3px, transparent 3px 5px)`
                      : s.color,
                  }}
                />
                <span className="text-ink-600 truncate">
                  {s.shiftedDays
                    ? `${s.label} (${formatDay(
                        hoverDay - s.shiftedDays,
                        true
                      )})`
                    : s.label}
                </span>
                <span className="text-ink-900 ml-auto pl-2 font-medium tabular-nums">
                  {y === undefined ? '—' : formatValue(y, pct)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
