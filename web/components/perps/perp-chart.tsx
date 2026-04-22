import { useEffect, useMemo, useState } from 'react'
import { scaleLinear, scaleTime } from 'd3-scale'
import { line } from 'd3-shape'
import { PerpContract } from 'common/contract'
import { DAY_MS } from 'common/util/time'
import { api } from 'web/lib/api/api'

type Point = { ts: number; value: number }

export const PerpChart = (props: {
  contract: PerpContract
  mode: 'price' | 'funding'
  height?: number
}) => {
  const { contract, mode, height = 240 } = props
  const [oraclePoints, setOraclePoints] = useState<Point[]>([])
  const [fundingPoints, setFundingPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const since = Date.now() - 30 * DAY_MS
    if (mode === 'price') {
      api('get-oracle-price-series', {
        feedId: contract.oracleFeedId,
        since,
        limit: 1000,
      })
        .then((res) => {
          if (cancelled) return
          setOraclePoints(res.map((p) => ({ ts: p.ts, value: p.price })))
        })
        .finally(() => !cancelled && setLoading(false))
    } else {
      // TODO(perps): once a funding-events API is added, fetch & render a step
      // chart of fundingRate over time. For v1 we render the latest rate as a
      // horizontal line so the toggle is wired up end-to-end.
      const rate = (contract as any).fundingRate ?? 0
      setFundingPoints([
        { ts: since, value: rate },
        { ts: Date.now(), value: rate },
      ])
      setLoading(false)
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
    const pad = (yMax - yMin) * 0.1 || 1
    const y = scaleLinear()
      .domain([yMin - pad, yMax + pad])
      .range([height - 20, 10])
    const l = line<Point>()
      .x((p) => x(p.ts))
      .y((p) => y(p.value))
    return { xScale: x, yScale: y, path: l(points) ?? '' }
  }, [points, height])

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

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
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
            {formatTick(t, mode)}
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
    </svg>
  )
}

const formatTick = (v: number, mode: 'price' | 'funding') => {
  if (mode === 'funding') return `${(v * 100).toFixed(3)}%`
  return Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4)
}
