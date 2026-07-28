import clsx from 'clsx'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { scaleLinear, scaleTime } from 'd3-scale'
import { line } from 'd3-shape'
import { PerpContract } from 'common/contract'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { DAY_MS } from 'common/util/time'
import { api } from 'web/lib/api/api'

export const FeedPerpPriceSparkline = (props: {
  contract: PerpContract
  className?: string
  height?: number
  emptyState?: ReactNode
  loadingState?: ReactNode
  showSummary?: boolean
}) => {
  const {
    contract,
    className,
    height = 120,
    emptyState,
    loadingState,
    showSummary = false,
  } = props
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
          res
            .filter(
              ({ ts, price }) =>
                Number.isFinite(ts) && Number.isFinite(price) && price > 0
            )
            .sort((a, b) => a.ts - b.ts)
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
  const chart = useMemo(() => {
    if (!points || points.length < 2) return ''
    const xs = points.map((p) => p.ts)
    const ys = points.map((p) => p.price)
    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    if (xMin === xMax) return ''
    const chartHeight = showSummary ? Math.max(28, height - 38) : height
    const x = scaleTime().domain([xMin, xMax]).range([0, width])
    const yMin = Math.min(...ys)
    const yMax = Math.max(...ys)
    const pad = (yMax - yMin) * 0.1 || 1
    const y = scaleLinear()
      .domain([yMin - pad, yMax + pad])
      .range([chartHeight - 4, 4])
    const path =
      line<{ ts: number; price: number }>()
        .x((p) => x(p.ts))
        .y((p) => y(p.price))(points) ?? ''
    return path
      ? {
          path,
          chartHeight,
          firstPrice: points[0].price,
          lastPrice: points[points.length - 1].price,
        }
      : ''
  }, [height, points, showSummary])

  if (!chart)
    return points === null ? (
      <>{loadingState ?? null}</>
    ) : (
      <>{emptyState ?? null}</>
    )

  const sparkline = (
    <svg
      width="100%"
      height={chart.chartHeight}
      viewBox={`0 0 ${width} ${chart.chartHeight}`}
      className={clsx(!showSummary && 'my-4', !showSummary && className)}
      role="img"
      aria-label="Seven-day oracle price history"
    >
      <path
        d={chart.path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-primary-500"
      />
    </svg>
  )

  if (!showSummary) return sparkline

  const priceDecimals = inferPriceDecimals([chart.firstPrice, chart.lastPrice])
  const changePct =
    ((chart.lastPrice - chart.firstPrice) / chart.firstPrice) * 100
  const validChange = Number.isFinite(changePct) ? changePct : null

  return (
    <div className={clsx('flex min-h-0 flex-col', className)}>
      <div className="text-ink-500 flex items-center justify-between text-xs">
        <span>7D oracle</span>
        {validChange != null && (
          <span
            className={clsx(
              'font-medium tabular-nums',
              validChange > 0
                ? 'text-teal-600 dark:text-teal-400'
                : validChange < 0
                ? 'text-scarlet-600 dark:text-scarlet-400'
                : 'text-ink-500'
            )}
          >
            {validChange > 0 ? '+' : ''}
            {validChange.toFixed(1)}%
          </span>
        )}
      </div>
      {sparkline}
      <div className="text-ink-400 flex justify-between text-[11px] tabular-nums">
        <span>{formatPrice(chart.firstPrice, priceDecimals)}</span>
        <span>{formatPrice(chart.lastPrice, priceDecimals)}</span>
      </div>
    </div>
  )
}
