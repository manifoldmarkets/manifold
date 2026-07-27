import clsx from 'clsx'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { scaleLinear, scaleTime } from 'd3-scale'
import { line } from 'd3-shape'
import { PerpContract } from 'common/contract'
import { DAY_MS } from 'common/util/time'
import { api } from 'web/lib/api/api'

export const FeedPerpPriceSparkline = (props: {
  contract: PerpContract
  className?: string
  height?: number
  emptyState?: ReactNode
}) => {
  const { contract, className, height = 120, emptyState } = props
  const [points, setPoints] = useState<{ ts: number; price: number }[] | null>(
    null
  )

  useEffect(() => {
    let cancelled = false
    setPoints(null)
    api('get-oracle-price-series', {
      feedId: contract.oracleFeedId,
      since: Date.now() - 7 * DAY_MS,
      // Five-minute buckets preserve a full week even for 15-second feeds.
      bucketSeconds: 5 * 60,
      limit: 2500,
    })
      .then((res) => {
        if (cancelled) return
        setPoints(
          res.filter(
            ({ ts, price }) => Number.isFinite(ts) && Number.isFinite(price)
          )
        )
      })
      .catch(() => {
        if (!cancelled) setPoints([])
      })
    return () => {
      cancelled = true
    }
  }, [contract.oracleFeedId])

  const width = 600
  const path = useMemo(() => {
    if (!points || points.length < 2) return ''
    const xs = points.map((p) => p.ts)
    const ys = points.map((p) => p.price)
    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    if (xMin === xMax) return ''
    const x = scaleTime().domain([xMin, xMax]).range([0, width])
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

  if (!path) return points === null ? null : <>{emptyState ?? null}</>

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={clsx('my-4', className)}
      role="img"
      aria-label="Seven-day oracle price history"
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
