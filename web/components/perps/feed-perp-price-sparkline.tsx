import { useEffect, useMemo, useState } from 'react'
import { scaleLinear, scaleTime } from 'd3-scale'
import { line } from 'd3-shape'
import { PerpContract } from 'common/contract'
import { DAY_MS } from 'common/util/time'
import { api } from 'web/lib/api/api'

export const FeedPerpPriceSparkline = (props: { contract: PerpContract }) => {
  const { contract } = props
  const [points, setPoints] = useState<{ ts: number; price: number }[]>([])

  useEffect(() => {
    let cancelled = false
    api('get-oracle-price-series', {
      feedId: contract.oracleFeedId,
      since: Date.now() - 7 * DAY_MS,
      limit: 200,
    }).then((res) => {
      if (!cancelled) setPoints(res)
    })
    return () => {
      cancelled = true
    }
  }, [contract.oracleFeedId])

  const width = 600
  const height = 120
  const path = useMemo(() => {
    if (points.length < 2) return ''
    const xs = points.map((p) => p.ts)
    const ys = points.map((p) => p.price)
    const x = scaleTime()
      .domain([Math.min(...xs), Math.max(...xs)])
      .range([0, width])
    const yMin = Math.min(...ys)
    const yMax = Math.max(...ys)
    const pad = (yMax - yMin) * 0.1 || 1
    const y = scaleLinear()
      .domain([yMin - pad, yMax + pad])
      .range([height - 4, 4])
    return (
      line<{ ts: number; price: number }>()
        .x((p) => x(p.ts))
        .y((p) => y(p.price))(points) ?? ''
    )
  }, [points])

  if (!path) return null

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="my-4"
    >
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
