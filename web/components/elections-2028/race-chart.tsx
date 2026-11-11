import clsx from 'clsx'
import { scaleLinear, scaleTime } from 'd3-scale'
import { curveMonotoneX, line } from 'd3-shape'
import {
  KeyboardEvent,
  PointerEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useMeasureSize } from 'web/hooks/use-measure-size'
import { formatOdds } from 'web/components/usa-map/election-display'
import { probAt, sliceFrom, TimePoint } from 'web/lib/politics/race-history'
import { CandidateAvatar } from './candidate-avatar'
import { ChartSeries } from './race-series'
import styles from './race-chart.module.css'

// A probability race drawn as one line per candidate, each ending in the
// candidate's face. Values lead the labels; colour only marks identity; a
// crosshair reads every line at once; labels that would collide slide apart
// and keep a leader line back to their line.

type Props = {
  series: ChartSeries[]
  start: number
  end: number
  height: number
  ariaLabel: string
  highlightId?: string
  onHighlight?: (id: string | undefined) => void
  onSelect?: (id: string) => void
  // The faces open a bet; until the full market has loaded they're inert.
  selectDisabled?: boolean
  className?: string
  // Remount key for the draw-in animation (the range, usually).
  animationKey?: string
}

const MARGIN = { top: 14, bottom: 26, left: 34 }

const NICE_MAXES = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1]

function niceMax(value: number) {
  return NICE_MAXES.find((m) => m >= value) ?? 1
}

function yTicks(max: number): number[] {
  const step = max <= 0.15 ? 0.05 : max <= 0.3 ? 0.1 : max <= 0.6 ? 0.2 : 0.25
  const ticks: number[] = []
  for (let t = 0; t <= max + 1e-9; t += step)
    ticks.push(Math.round(t * 100) / 100)
  return ticks
}

const DAY = 24 * 60 * 60 * 1000

function formatTick(t: number, span: number) {
  const d = new Date(t)
  if (span <= 2 * DAY) return d.toLocaleTimeString('en-US', { hour: 'numeric' })
  // A short range on a wide chart can tick twice a day: the hour tells the
  // noon tick from the midnight one.
  if (span <= 10 * DAY && (d.getHours() !== 0 || d.getMinutes() !== 0))
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    })
  if (span <= 120 * DAY)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (span <= 3 * 365 * DAY)
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  return String(d.getFullYear())
}

function formatHoverDate(t: number, span: number) {
  const d = new Date(t)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(span <= 2 * DAY
      ? { hour: 'numeric', minute: '2-digit' }
      : span <= 10 * DAY
      ? { hour: 'numeric' }
      : {}),
  })
}

// Push labels apart so none overlap, keeping them inside [lo, hi] and as
// close to their lines as they can be.
export function spreadLabels(
  desired: number[],
  gap: number,
  lo: number,
  hi: number
): number[] {
  const order = desired.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  const ys = order.map((o) => o.y)
  for (let k = 1; k < ys.length; k++) ys[k] = Math.max(ys[k], ys[k - 1] + gap)
  if (ys.length && ys[ys.length - 1] > hi) {
    ys[ys.length - 1] = hi
    for (let k = ys.length - 2; k >= 0; k--)
      ys[k] = Math.min(ys[k], ys[k + 1] - gap)
  }
  if (ys.length && ys[0] < lo) {
    ys[0] = lo
    for (let k = 1; k < ys.length; k++) ys[k] = Math.max(ys[k], ys[k - 1] + gap)
  }
  const out = new Array<number>(desired.length)
  order.forEach((o, k) => (out[o.i] = ys[k]))
  return out
}

export function RaceChart(props: Props) {
  const {
    series,
    start,
    end,
    height,
    ariaLabel,
    highlightId,
    onHighlight,
    onSelect,
    selectDisabled,
    className,
    animationKey,
  } = props
  const { elemRef, width } = useMeasureSize()
  const [hoverT, setHoverT] = useState<number | undefined>()
  // Draw the lines in once the chart is on screen, so readers further down
  // the page see it happen. Until then (and without IntersectionObserver)
  // the chart is simply drawn.
  const [animate, setAnimate] = useState(false)
  useEffect(() => {
    const el = elemRef.current
    if (!el || animate || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setAnimate(true)
          io.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [animate, elemRef])

  const compact = (width ?? 0) < 520
  const avatar = compact ? 24 : 30
  const labelWidth = compact ? 58 : 92
  const gutter = 10 + avatar + 6 + labelWidth
  const plotWidth = Math.max(40, (width ?? 0) - MARGIN.left - gutter)
  const plotHeight = height - MARGIN.top - MARGIN.bottom

  const visible = useMemo(
    () =>
      series.map((s) => sliceFrom(s.points, start).filter(([t]) => t <= end)),
    [series, start, end]
  )

  const yMax = useMemo(() => {
    let max = 0.05
    visible.forEach((pts, i) => {
      for (const [, p] of pts) max = Math.max(max, p)
      max = Math.max(max, series[i].prob)
    })
    return niceMax(Math.min(1, max * 1.12))
  }, [visible, series])

  const x = useMemo(
    () => scaleTime().domain([start, end]).range([0, plotWidth]),
    [start, end, plotWidth]
  )
  const y = useMemo(
    () => scaleLinear().domain([0, yMax]).range([plotHeight, 0]),
    [yMax, plotHeight]
  )

  const paths = useMemo(() => {
    const gen = line<TimePoint>()
      .x(([t]) => x(t))
      .y(([, p]) => y(Math.min(p, yMax)))
      .curve(curveMonotoneX)
    return visible.map((pts) => (pts.length > 1 ? gen(pts) ?? '' : ''))
  }, [visible, x, y, yMax])

  const ends = series.map((s) => y(Math.min(s.prob, yMax)))
  const labelYs = spreadLabels(
    ends,
    avatar + 6,
    avatar / 2,
    plotHeight - avatar / 2 + 4
  )

  const span = end - start
  const xTicks = width
    ? x.ticks(Math.max(3, Math.floor(plotWidth / 85))).map((d) => d.valueOf())
    : []

  const hovered =
    hoverT === undefined
      ? undefined
      : series
          .map((s, i) => ({ s, p: probAt(visible[i], hoverT) }))
          .filter((r): r is { s: ChartSeries; p: number } => r.p !== undefined)
          .sort((a, b) => b.p - a.p)

  const setFromPointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = Math.min(plotWidth, Math.max(0, e.clientX - rect.left))
    setHoverT(x.invert(px).valueOf())
  }

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const stepT = span / 40
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const base = hoverT ?? end
      const next = base + (e.key === 'ArrowLeft' ? -stepT : stepT)
      setHoverT(Math.min(end, Math.max(start, next)))
    } else if (e.key === 'Escape') setHoverT(undefined)
  }

  const dim = (id: string) => highlightId !== undefined && highlightId !== id

  return (
    <div
      ref={elemRef}
      className={clsx('relative w-full select-none', className)}
      style={{ height }}
    >
      {width ? (
        <>
          {/* The plot is one image to assistive tech (the leaderboard beside
              it is the table view); arrow keys move the crosshair. */}
          <svg
            width={width}
            height={height}
            className="focus-visible:ring-primary-400 absolute inset-0 overflow-visible rounded-md outline-none focus-visible:ring-2"
            role="img"
            aria-label={ariaLabel}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onFocus={() => setHoverT((t) => t ?? end)}
            onBlur={() => setHoverT(undefined)}
          >
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {yTicks(yMax).map((t) => (
                <g key={t}>
                  <line
                    x1={0}
                    x2={plotWidth}
                    y1={y(t)}
                    y2={y(t)}
                    className={t === 0 ? 'stroke-ink-300' : 'stroke-ink-200'}
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  <text
                    x={-8}
                    y={y(t)}
                    dy="0.32em"
                    textAnchor="end"
                    className="fill-ink-500 text-[11px] tabular-nums"
                  >
                    {Math.round(t * 100)}%
                  </text>
                </g>
              ))}
              {xTicks.map((t) => (
                <text
                  key={t}
                  x={x(t)}
                  y={plotHeight + 18}
                  textAnchor="middle"
                  className="fill-ink-500 text-[11px]"
                >
                  {formatTick(t, span)}
                </text>
              ))}

              {/* Lines: lighter challengers first so the leaders draw on top. */}
              <g key={animationKey}>
                {series
                  .map((s, i) => ({ s, i }))
                  .sort(
                    (a, b) =>
                      Number(a.s.emphasis) - Number(b.s.emphasis) || b.i - a.i
                  )
                  .map(({ s, i }) =>
                    paths[i] ? (
                      <path
                        key={s.id}
                        d={paths[i]}
                        pathLength={1}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={s.emphasis ? 2.5 : 2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        opacity={dim(s.id) ? 0.15 : s.emphasis ? 1 : 0.6}
                        className={clsx(
                          animate && styles.drawIn,
                          'transition-opacity'
                        )}
                        style={{ animationDelay: `${i * 90}ms` }}
                      />
                    ) : null
                  )}
              </g>

              {/* End dots and leader lines out to the faces. */}
              {series.map((s, i) => (
                <g
                  key={s.id}
                  opacity={dim(s.id) ? 0.2 : 1}
                  className={clsx(
                    animate && styles.fadeIn,
                    'transition-opacity'
                  )}
                  style={{ animationDelay: `${700 + i * 60}ms` }}
                >
                  {Math.abs(labelYs[i] - ends[i]) > 1.5 && (
                    <line
                      x1={plotWidth + 3}
                      y1={ends[i]}
                      x2={plotWidth + 10}
                      y2={labelYs[i]}
                      stroke={s.color}
                      strokeWidth={1}
                    />
                  )}
                  <circle
                    cx={plotWidth}
                    cy={ends[i]}
                    r={4}
                    fill={s.color}
                    className="stroke-canvas-0"
                    strokeWidth={2}
                  />
                </g>
              ))}

              {/* Crosshair. */}
              {hovered && hoverT !== undefined && (
                <g pointerEvents="none">
                  <line
                    x1={x(hoverT)}
                    x2={x(hoverT)}
                    y1={0}
                    y2={plotHeight}
                    className="stroke-ink-400"
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  {hovered.map(({ s, p }) => (
                    <circle
                      key={s.id}
                      cx={x(hoverT)}
                      cy={y(Math.min(p, yMax))}
                      r={4}
                      fill={s.color}
                      className="stroke-canvas-0"
                      strokeWidth={2}
                    />
                  ))}
                </g>
              )}

              <rect
                width={plotWidth}
                height={plotHeight}
                fill="transparent"
                onPointerMove={setFromPointer}
                onPointerDown={setFromPointer}
                onPointerLeave={() => setHoverT(undefined)}
                style={{ touchAction: 'pan-y' }}
              />
            </g>
          </svg>

          {/* Faces and labels, as HTML over the plot's right edge. */}
          {series.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={clsx(
                animate && styles.fadeIn,
                'absolute flex items-center gap-1.5 rounded-full text-left transition-opacity',
                selectDisabled && 'cursor-default',
                dim(s.id) && 'opacity-30'
              )}
              style={{
                left: MARGIN.left + plotWidth + 10,
                top: MARGIN.top + labelYs[i] - avatar / 2,
                height: avatar,
                animationDelay: `${650 + i * 60}ms`,
              }}
              onMouseEnter={() => onHighlight?.(s.id)}
              onMouseLeave={() => onHighlight?.(undefined)}
              onFocus={() => onHighlight?.(s.id)}
              onBlur={() => onHighlight?.(undefined)}
              onClick={() => !selectDisabled && onSelect?.(s.id)}
              aria-disabled={selectDisabled || undefined}
              aria-label={`${s.candidate.name}: ${formatOdds(s.prob)}. Bet`}
            >
              <CandidateAvatar
                candidate={s.candidate}
                size={avatar}
                ringColor={s.color}
                party={s.party}
              />
              <span
                className="flex flex-col leading-none"
                style={{ width: labelWidth }}
              >
                <span className="text-ink-900 text-sm font-semibold">
                  {formatOdds(s.prob)}
                </span>
                <span className="text-ink-600 mt-0.5 truncate text-[11px]">
                  {s.candidate.shortName}
                </span>
              </span>
            </button>
          ))}

          {hovered && hoverT !== undefined && (
            <HoverCard
              rows={hovered}
              left={MARGIN.left + x(hoverT)}
              plotLeft={MARGIN.left}
              plotRight={MARGIN.left + plotWidth}
              title={formatHoverDate(hoverT, span)}
            />
          )}
        </>
      ) : null}
    </div>
  )
}

function HoverCard(props: {
  rows: { s: ChartSeries; p: number }[]
  left: number
  plotLeft: number
  plotRight: number
  title: string
}) {
  const { rows, left, plotLeft, plotRight, title } = props
  const cardWidth = 176
  // Flip to the left of the crosshair past the plot's midpoint.
  const onRight = left < (plotLeft + plotRight) / 2
  const x = onRight ? left + 12 : left - 12 - cardWidth
  return (
    <div
      className="bg-canvas-0 border-ink-200 pointer-events-none absolute top-2 z-10 rounded-lg border px-2.5 py-2 text-xs shadow-lg"
      style={{ left: Math.max(0, x), width: cardWidth }}
    >
      <div className="text-ink-500 mb-1 font-medium">{title}</div>
      {rows.map(({ s, p }) => (
        <div key={s.id} className="flex items-center gap-1.5 py-0.5">
          <span
            className="h-0.5 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: s.color }}
          />
          <span className="text-ink-900 w-9 shrink-0 font-semibold tabular-nums">
            {formatOdds(p)}
          </span>
          <span className="text-ink-600 truncate">{s.candidate.shortName}</span>
        </div>
      ))}
    </div>
  )
}
