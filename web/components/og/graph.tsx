import {
  area,
  curveStepBefore,
  curveLinear,
  curveMonotoneX,
  line,
} from 'd3-shape'
import { scaleLinear, scaleTime } from 'd3-scale'
import { Point } from 'common/edge/og'

export function ProfitLossGraph(props: {
  data: Point[]
  height: number
  /** scaled width / height */
  aspectRatio?: number
}) {
  const { data, height, aspectRatio = 1 } = props
  const w = height * aspectRatio
  const h = height
  const visibleRange = [data[0].x, data[data.length - 1].x]
  const minY = Math.min(...data.map((p) => p.y))
  const maxY = Math.max(...data.map((p) => p.y))
  const curve = curveStepBefore

  const xScale = scaleTime(visibleRange, [0, w])
  const yScale = scaleLinear([minY, maxY], [h, 0])
  const px = (p: Point) => xScale(p.x)
  const py0 = yScale(0)
  const py1 = (p: Point) => yScale(p.y)
  // const clipId = ':rnm:'
  const gradientId = ':rnc:'
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const da = area(px, py0, py1).curve(curve)(data)!
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const dl = line(px, py1).curve(curve)(data)!
  const color = (p: Point) => (p.y >= 0 ? '#14b8a6' : '#FFA799')
  const stops = computeColorStops(data, color, px)

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id={gradientId}>
          {stops.map((s, i) => (
            <stop key={i} offset={`${s.x / w}`} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>

      <g>
        <path d={da} fill={`url(#${gradientId})`} opacity={0.2} />
        <path
          d={dl}
          stroke={`url(#${gradientId})`}
          strokeWidth={4}
          fill="none"
        />
      </g>
    </svg>
  )
}

const computeColorStops = (
  data: Point[],
  pc: (p: Point) => string,
  px: (p: Point) => number
) => {
  const segments: { x: number; color: string }[] = []
  let currOffset = px(data[0])
  let currColor = pc(data[0])
  for (const p of data) {
    const c = pc(p)
    if (c !== currColor) {
      segments.push({ x: currOffset, color: currColor })
      currOffset = px(p)
      currColor = c
    }
  }
  segments.push({ x: currOffset, color: currColor })

  const stops: { x: number; color: string }[] = []
  stops.push({ x: segments[0].x, color: segments[0].color })
  for (const s of segments.slice(1)) {
    stops.push({ x: s.x, color: stops[stops.length - 1].color })
    stops.push({ x: s.x, color: s.color })
  }
  return stops
}

export function Sparkline(props: {
  data: Point[]
  height: number
  /** width / height */
  aspectRatio?: number
  min: number
  max: number
  color?: string
  className?: string
}) {
  const { data, height: h, aspectRatio = 1, min, max, color, className } = props
  const w = h * aspectRatio
  const visibleRange = [data[0].x, data[data.length - 1].x]
  const curve = data.length > 50 ? curveLinear : curveStepBefore

  const xScale = scaleTime(visibleRange, [0, w - 4])
  const yScale = scaleLinear([min, max], [h, 0])
  const px = (p: Point) => xScale(p.x)
  const py1 = (p: Point) => yScale(p.y)

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const dl = line(px, py1).curve(curve)(data)!

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className}>
      <path
        d={dl}
        stroke={color}
        strokeWidth={4}
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Smallest probability range the graph spans: moves under a few points stay
// flat, a 10-point move climbs half the strip, and 20 or more fill it. The
// start and end labels carry the magnitude, so the line can fit its range.
const MIN_PROB_SPAN = 0.2

/** y-domain for the graph: the data's range, widened to MIN_PROB_SPAN for
 * probabilities (kept within 0..1), or as-is for other series like prices */
export function getProbGraphDomain(data: Point[]): [number, number] {
  const minY = Math.min(...data.map((p) => p.y))
  const maxY = Math.max(...data.map((p) => p.y))
  if (!isProbabilitySeries(data)) {
    return [minY, maxY === minY ? maxY + 1 : maxY]
  }

  const span = Math.max(maxY - minY, MIN_PROB_SPAN)
  const mid = (minY + maxY) / 2
  let lo = mid - span / 2
  let hi = mid + span / 2
  if (lo < 0) {
    hi -= lo
    lo = 0
  }
  if (hi > 1) {
    lo -= hi - 1
    hi = 1
  }
  return [Math.max(lo, 0), hi]
}

function isProbabilitySeries(data: Point[]) {
  return data.every((p) => p.y >= 0 && p.y <= 1)
}

// Samples across the strip the series is resampled to before drawing
const GRAPH_SAMPLES = 100
// Forward-looking window, in samples, that turns a one-bet jump into a short
// ramp. On a 7.5:1 strip a jump would otherwise draw as a vertical wall.
const GRAPH_SMOOTHING = 6

/** Resamples the series onto an even time grid, holding each value until the
 * next point (a probability doesn't move between bets), then smooths each
 * sample with the average of the next few, so the final value stays exact and
 * transitions start slightly before they happened */
export function smoothSeries(
  data: Point[],
  samples = GRAPH_SAMPLES,
  window = GRAPH_SMOOTHING
): Point[] {
  if (data.length < 2) return data
  const x0 = data[0].x
  const x1 = data[data.length - 1].x
  if (x1 <= x0) return data
  const xAt = (i: number) => x0 + ((x1 - x0) * i) / (samples - 1)

  const grid: number[] = []
  let j = 0
  for (let i = 0; i < samples; i++) {
    const x = xAt(i)
    while (j < data.length - 1 && data[j + 1].x <= x) j++
    grid.push(data[j].y)
  }

  return grid.map((_, i) => {
    const end = Math.min(i + window, samples - 1)
    let sum = 0
    for (let k = i; k <= end; k++) sum += grid[k]
    return { x: xAt(i), y: sum / (end - i + 1) }
  })
}

export function ProbGraph(props: {
  data: Point[]
  height: number
  /** scaled width / height */
  aspectRatio?: number
  color?: string
  /** Space at the bottom of the strip that the outcome row overlays */
  bottomInset?: number
  /** Label the line's first and last values, so the size of a move can be
   * read without another reference. Probability series only. */
  endpointLabels?: boolean
}) {
  const {
    height,
    color = '#14b866',
    aspectRatio = 1,
    bottomInset = 0,
    endpointLabels = false,
  } = props
  const data = smoothSeries(props.data)
  const w = height * aspectRatio
  const h = height
  const visibleRange = [data[0].x, data[data.length - 1].x]
  // Rounds the corners of step changes without overshooting the data
  const curve = curveMonotoneX
  const endDotRadius = 4.5
  const domain = getProbGraphDomain(data)
  const showLabels = endpointLabels && isProbabilitySeries(data)
  const labelWidth = showLabels ? 36 : 0
  const plotWidth = w - 2 * labelWidth
  const xScale = scaleTime(visibleRange, [0, plotWidth - endDotRadius - 1])
  // Keep the line clear of the top edge and of the overlaid outcome row, with
  // enough padding that a flat stretch never sits on either edge
  const yScale = scaleLinear(domain, [
    h - bottomInset - endDotRadius - 2,
    endDotRadius + 2,
  ])
  const px = (p: Point) => xScale(p.x)
  const py1 = (p: Point) => yScale(p.y)
  const first = data[0]
  const last = data[data.length - 1]
  const percent = (p: Point) => `${Math.round(p.y * 100)}%`
  const gradientId = ':rnc:'
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const da = area(px, h, py1).curve(curve)(data)!
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const dl = line(px, py1).curve(curve)(data)!

  return (
    <div className="relative flex" style={{ width: w, height: h }}>
      {showLabels && (
        <div
          className="absolute flex justify-end text-gray-500"
          style={{
            left: 0,
            width: labelWidth - 8,
            top: py1(first) - 8,
            fontSize: 12,
            lineHeight: '16px',
          }}
        >
          {percent(first)}
        </div>
      )}
      <svg
        width={plotWidth}
        height={h}
        viewBox={`0 0 ${plotWidth} ${h}`}
        style={{ marginLeft: labelWidth }}
      >
        <defs>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={gradientId}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.25" />
          </linearGradient>
        </defs>

        <g>
          <path d={da} fill={`url(#${gradientId})`} opacity={0.1} />
          <path
            d={dl}
            stroke={color}
            strokeWidth={3}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Marks the current value, so a late jump reads as data, not a glitch */}
          <circle
            cx={px(last)}
            cy={py1(last)}
            r={endDotRadius}
            fill={color}
            stroke="#ffffff"
            strokeWidth={2}
          />
        </g>
      </svg>
      {showLabels && (
        <div
          className="absolute flex font-semibold"
          style={{
            left: labelWidth + plotWidth + 6,
            width: labelWidth - 6,
            top: py1(last) - 8,
            fontSize: 12,
            lineHeight: '16px',
            color,
          }}
        >
          {percent(last)}
        </div>
      )}
    </div>
  )
}
