import clsx from 'clsx'
import { scaleLinear, ScaleLinear } from 'd3-scale'
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
  // Drawn against its own axis on the left: an overlay on a different scale
  // from the primary series, which would otherwise flatten one of them.
  secondaryAxis?: boolean
  // Values are fractions. Defaults to the chart's pct.
  pct?: boolean
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

export const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(
  ' '
)
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

// Past this many days the x axis is labelled by month.
const LONG_RANGE_DAYS = 300

// Month starts in [from, to], every 1, 2, 3, 6, 12 or 24 months counted from
// January (the fewest that fit), so a long range reads Jan ’25, Jul ’25, ...
// rather than whichever days d3's round day numbers land on.
const monthTicks = (from: number, to: number, maxTicks: number) => {
  const [y0, m0] = fromDayNumber(from).split('-').map(Number)
  const starts: { n: number; index: number }[] = []
  for (let index = y0 * 12 + m0 - 1; ; index++) {
    const y = Math.floor(index / 12)
    const m = (index % 12) + 1
    const n = toDayNumber(`${y}-${String(m).padStart(2, '0')}-01`)
    if (!Number.isFinite(n) || n > to) break
    if (n >= from) starts.push({ n, index })
  }
  for (const step of [1, 2, 3, 6, 12, 24]) {
    const ticks = starts.filter((s) => s.index % step === 0).map((s) => s.n)
    if (ticks.length <= maxTicks) return ticks
  }
  return []
}

const formatValue = (y: number, pct: boolean | undefined) =>
  pct ? formatPercent(y) : formatCount(y)
// formatPercent gives values under 2% a decimal, which a zero tick doesn't need.
const formatAxisValue = (y: number, pct: boolean | undefined) =>
  pct ? (y === 0 ? '0%' : formatPercent(y)) : formatLargeNumber(y)

// The smallest round step (1, 2, 2.5 or 5 times a power of ten) at least
// `raw`. Percent axes skip 2.5, which formatPercent would round to 3%.
const niceStep = (raw: number, pct: boolean | undefined) => {
  if (!(raw > 0) || !Number.isFinite(raw)) return pct ? 0.01 : 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const multiples = pct ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]
  return (
    multiples.map((m) => m * magnitude).find((s) => s >= raw * (1 - 1e-9)) ??
    10 * magnitude
  )
}

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
// Room for the secondary axis's labels, when there is one.
const SECONDARY_AXIS_WIDTH = 44

function ChartBody(props: {
  w: number
  h: number
  series: StatsChartSeries[]
  pct?: boolean
  ariaLabel: string
}) {
  const { w, h, series, pct, ariaLabel } = props
  const hasSecondary = series.some((s) => s.secondaryAxis)
  const marginLeft = MARGIN.left + (hasSecondary ? SECONDARY_AXIS_WIDTH : 0)
  const plotW = Math.max(w - marginLeft - MARGIN.right, 10)
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

  const {
    xScale,
    yScale,
    ySecondary,
    xTicks,
    yTicks,
    secondaryTicks,
    secondaryPct,
    spansYears,
  } = useMemo(() => {
    const days = prepared.flatMap((s) => s.nPoints.map((p) => p.n))
    const xMin = Math.min(...days)
    const xMax = Math.max(...days, xMin + 1)
    const xScale = scaleLinear([xMin, xMax], [0, plotW])
    // Month labels ("Jul ’25") are narrower than day labels ("Sep 24").
    const xTicks =
      xMax - xMin > LONG_RANGE_DAYS
        ? monthTicks(xMin, xMax, Math.max(2, Math.floor(plotW / 70)))
        : uniq(
            xScale.ticks(Math.max(2, Math.floor(plotW / 90))).map(Math.round)
          ).filter((n) => n >= xMin && n <= xMax)

    const valuesOn = (secondary: boolean) =>
      prepared
        .filter((s) => !!s.secondaryAxis === secondary)
        .flatMap((s) => s.nPoints.map((p) => p.y))
    const ys = valuesOn(false)
    const yMin = Math.min(0, ...ys)
    const yMax = Math.max(...ys, yMin + (pct ? 0.01 : 1))
    const yScale = scaleLinear([yMin, yMax], [plotH, 0]).nice(4)
    const yTicks = yScale.ticks(4)

    const secondaryPct = prepared.find((s) => s.secondaryAxis)?.pct ?? pct
    const secondaryYs = valuesOn(true)
    let ySecondary: ScaleLinear<number, number> | undefined
    let secondaryTicks: number[] = []
    if (secondaryYs.length > 0) {
      const sMin = Math.min(0, ...secondaryYs)
      const sMax = Math.max(...secondaryYs)
      const [d0, d1] = yScale.domain()
      const intervals = yTicks.length - 1
      // When both axes start at zero, the secondary axis gets a round step of
      // its own over the same number of intervals, so its labels sit on the
      // primary axis's gridlines.
      const aligned =
        sMin === 0 &&
        d0 === 0 &&
        intervals > 0 &&
        yTicks[0] === 0 &&
        Math.abs(yTicks[intervals] - d1) <= 1e-9 * Math.max(1, Math.abs(d1))
      if (aligned) {
        const step = niceStep(sMax / intervals, secondaryPct)
        ySecondary = scaleLinear([0, step * intervals], [plotH, 0])
        secondaryTicks = yTicks.map((_, i) => i * step)
      } else {
        const top = Math.max(sMax, sMin + (secondaryPct ? 0.01 : 1))
        ySecondary = scaleLinear([sMin, top], [plotH, 0]).nice(4)
        secondaryTicks = ySecondary.ticks(4)
      }
    }
    return {
      xScale,
      yScale,
      ySecondary,
      xTicks,
      yTicks,
      secondaryTicks,
      secondaryPct,
      spansYears: xMax - xMin > LONG_RANGE_DAYS,
    }
  }, [prepared, plotW, plotH, pct])

  const scaleFor = (s: StatsChartSeries) =>
    (s.secondaryAxis && ySecondary) || yScale
  const linePath = (s: StatsChartSeries) =>
    line<{ n: number; y: number }>()
      .x((p) => xScale(p.n))
      .y((p) => scaleFor(s)(p.y))
  // With two axes, each axis's labels take its series' color.
  const primaryColor = hasSecondary
    ? prepared.find((s) => !s.secondaryAxis)?.color
    : undefined
  const secondaryColor = prepared.find((s) => s.secondaryAxis)?.color
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
    const n = Math.round(xScale.invert(clientX - rect.left - marginLeft))
    setHoverDay(Math.min(xMax, Math.max(xMin, n)))
  }

  const hoverX = hoverDay === undefined ? undefined : xScale(hoverDay)
  const tooltipLeft =
    hoverX === undefined
      ? 0
      : hoverX + marginLeft > w / 2
      ? hoverX + marginLeft - 12
      : hoverX + marginLeft + 12

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
        <g transform={`translate(${marginLeft},${MARGIN.top})`}>
          {yTicks.map((t) => (
            <g key={t} transform={`translate(0,${yScale(t)})`}>
              <line x2={plotW} className="stroke-ink-200" strokeWidth={1} />
              <text
                x={plotW + 6}
                dy="0.32em"
                className="fill-ink-500 text-[11px] tabular-nums"
                style={primaryColor ? { fill: primaryColor } : undefined}
              >
                {formatAxisValue(t, pct)}
              </text>
            </g>
          ))}
          {ySecondary &&
            secondaryTicks.map((t) => (
              <text
                key={`secondary-${t}`}
                x={-6}
                y={ySecondary(t)}
                dy="0.32em"
                textAnchor="end"
                className="text-[11px] tabular-nums"
                style={{ fill: secondaryColor }}
              >
                {formatAxisValue(t, secondaryPct)}
              </text>
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
                  cy={scaleFor(s)(run[0].y)}
                  r={2.5}
                  fill={s.color}
                />
              ) : (
                <path
                  key={`${s.key}-${i}`}
                  d={linePath(s)(run) ?? undefined}
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
                    cy={scaleFor(s)(y)}
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
              hoverX + marginLeft > w / 2 &&
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
                  {y === undefined ? '—' : formatValue(y, s.pct ?? pct)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
