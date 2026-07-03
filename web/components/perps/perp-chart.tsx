import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { scaleLinear, scaleTime } from 'd3-scale'
import { line } from 'd3-shape'
import { PerpContract } from 'common/contract'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { api } from 'web/lib/api/api'

type Point = { ts: number; value: number }

// Funding events fire hourly in the engine (FUNDING_PERIOD_MS = HOUR_MS), so
// the per-period rate annualizes as rate * 24 * 365. Mirrors the constant in
// perp-overview.tsx.
const FUNDING_PERIODS_PER_YEAR = 24 * 365

export const PerpChart = (props: {
  contract: PerpContract
  mode: 'price' | 'funding'
  height?: number
}) => {
  const { contract, mode, height = 240 } = props
  const [oraclePoints, setOraclePoints] = useState<Point[]>([])
  const [fundingPoints, setFundingPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setHoverIdx(null)
    // No `since` filter: backend returns the most recent `limit` points.
    // 1000 points ≈ 3 years at daily cadence, plenty for the chart view.
    if (mode === 'price') {
      api('get-oracle-price-series', {
        feedId: contract.oracleFeedId,
        limit: 1000,
      })
        .then((res) => {
          if (cancelled) return
          setOraclePoints(res.map((p) => ({ ts: p.ts, value: p.price })))
        })
        .finally(() => !cancelled && setLoading(false))
    } else {
      api('get-perp-funding-events', {
        contractId: contract.id,
        limit: 1000,
      })
        .then((res) => {
          if (cancelled) return
          const series = res.map((p) => ({
            ts: p.ts,
            value: p.fundingRate,
          }))
          // Anchor the last point to "now" with the current rate so the chart
          // doesn't drop off before the next funding tick.
          const currentRate = (contract as any).fundingRate ?? 0
          series.push({ ts: Date.now(), value: currentRate })
          setFundingPoints(series)
        })
        .finally(() => !cancelled && setLoading(false))
    }
    return () => {
      cancelled = true
    }
  }, [contract.id, mode])

  const points = mode === 'price' ? oraclePoints : fundingPoints
  const width = 720

  const { xScale, yScale, path } = useMemo(() => {
    if (!points.length) return { xScale: null, yScale: null, path: '' }
    const xs = points.map((p) => p.ts)
    const ys = points.map((p) => p.value)
    const x = scaleTime()
      .domain([Math.min(...xs), Math.max(...xs)])
      .range([40, width - 10])
    const yMin = Math.min(...ys)
    const yMax = Math.max(...ys)
    // Flat series need a synthetic pad, but the fallback must match the
    // data's units: ±1 is fine for prices, while funding rates are raw
    // per-hour fractions (~1e-5), where a ±1 pad renders the axis as
    // ±876,000% annualized. Pad relative to the series' own magnitude.
    const flatPad =
      mode === 'funding'
        ? Math.max(Math.abs(yMax), Math.abs(yMin)) * 0.5 || 1e-5
        : 1
    const pad = (yMax - yMin) * 0.1 || flatPad
    const y = scaleLinear()
      .domain([yMin - pad, yMax + pad])
      .range([height - 20, 10])
    const l = line<Point>()
      .x((p) => x(p.ts))
      .y((p) => y(p.value))
    return { xScale: x, yScale: y, path: l(points) ?? '' }
  }, [points, height, mode])

  if (loading) {
    return (
      <div
        className="bg-canvas-50 flex items-center justify-center rounded-md"
        style={{ height }}
      >
        <span className="text-ink-500 text-sm">Loading chart…</span>
      </div>
    )
  }
  if (!points.length || !xScale || !yScale) {
    return (
      <div
        className="bg-canvas-50 flex items-center justify-center rounded-md"
        style={{ height }}
      >
        <span className="text-ink-500 text-sm">No data yet</span>
      </div>
    )
  }

  const yTicks = yScale.ticks(4)
  // Infer decimals from the whole series so every tick uses the same scale.
  // For price mode, integer-valued series (e.g. DAU) render as "39" not
  // "39.0000"; for funding we annualize as a percentage with 2 decimals.
  const priceDecimals =
    mode === 'price' ? inferPriceDecimals(points.map((p) => p.value)) : 0

  // Convert a mouse event's client x to the nearest data point index. We
  // map client x into viewBox coords using the SVG's bounding rect; the
  // viewBox has fixed width=720, so one clientX px maps to (720 / rectWidth)
  // viewBox units.
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const vbX = ((e.clientX - rect.left) / rect.width) * width
    // Bisect by x-pixel of each point.
    let closest = 0
    let bestDist = Infinity
    for (let i = 0; i < points.length; i++) {
      const px = xScale(points[i].ts)
      const d = Math.abs(px - vbX)
      if (d < bestDist) {
        bestDist = d
        closest = i
      }
    }
    setHoverIdx(closest)
  }

  const hovered = hoverIdx != null ? points[hoverIdx] : null
  const hoveredX = hovered ? xScale(hovered.ts) : 0
  const hoveredY = hovered ? yScale(hovered.value) : 0

  // Position the tooltip above the crosshair, but flip it to the right of
  // the cursor when close to the left edge so it doesn't clip.
  const tooltipLeftPct = hovered ? (hoveredX / width) * 100 : 0
  const nearLeftEdge = tooltipLeftPct < 20
  const nearRightEdge = tooltipLeftPct > 80

  return (
    <div className="relative" style={{ height }}>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={40}
              x2={width - 10}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
            <text
              x={4}
              y={yScale(t) + 4}
              fontSize={10}
              fill="currentColor"
              opacity={0.6}
            >
              {formatTick(t, mode, priceDecimals)}
            </text>
          </g>
        ))}
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-primary-500"
        />
        {hovered && (
          <g className="text-primary-500 pointer-events-none">
            <line
              x1={hoveredX}
              x2={hoveredX}
              y1={10}
              y2={height - 20}
              stroke="currentColor"
              strokeOpacity={0.4}
              strokeDasharray="3 3"
            />
            <circle
              cx={hoveredX}
              cy={hoveredY}
              r={3.5}
              fill="currentColor"
              stroke="white"
              strokeWidth={1}
            />
          </g>
        )}
      </svg>
      {hovered && (
        <div
          className="bg-canvas-0 border-ink-200 pointer-events-none absolute top-2 whitespace-nowrap rounded-md border px-2 py-1 text-xs shadow-sm"
          style={{
            left: `${tooltipLeftPct}%`,
            transform: nearLeftEdge
              ? 'translateX(8px)'
              : nearRightEdge
              ? 'translateX(calc(-100% - 8px))'
              : 'translateX(-50%)',
          }}
        >
          <div className="text-ink-500">{formatHoverDate(hovered.ts)}</div>
          <div className="text-ink-900 font-semibold tabular-nums">
            {formatHoverValue(hovered.value, mode, priceDecimals)}
          </div>
        </div>
      )}
    </div>
  )
}

const formatTick = (
  v: number,
  mode: 'price' | 'funding',
  priceDecimals: number
) => {
  if (mode === 'funding') {
    const annualPct = v * FUNDING_PERIODS_PER_YEAR * 100
    return `${annualPct.toFixed(
      annualPct >= 100 || annualPct <= -100 ? 0 : 1
    )}%`
  }
  return formatPrice(v, priceDecimals)
}

const formatHoverValue = (
  v: number,
  mode: 'price' | 'funding',
  priceDecimals: number
) => {
  if (mode === 'funding') {
    const annualPct = v * FUNDING_PERIODS_PER_YEAR * 100
    const sign = annualPct > 0 ? '+' : ''
    return `${sign}${annualPct.toFixed(2)}% APR`
  }
  // For price mode, bump decimals slightly for the hover readout so tiny
  // movements are visible even on coarse-scale axes.
  const hoverDecimals = Math.max(priceDecimals, v === Math.round(v) ? 0 : 2)
  return formatPrice(v, hoverDecimals)
}

const formatHoverDate = (ts: number) => {
  const d = dayjs(ts)
  const now = dayjs()
  // If within the same day, show time of day; otherwise show the date.
  if (d.isSame(now, 'day')) return d.format('h:mm A')
  if (d.isSame(now, 'year')) return d.format('MMM D, h:mm A')
  return d.format('MMM D, YYYY')
}
