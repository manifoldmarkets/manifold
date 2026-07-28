import clsx from 'clsx'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { scaleLinear, scaleTime } from 'd3-scale'
import { line } from 'd3-shape'
import { PerpContract } from 'common/contract'
import { formatPrice, inferPriceDecimals } from 'common/perps/format'
import { formatOraclePriceTick } from 'common/perps/oracle-display'
import { DAY_MS } from 'common/util/time'
import { api } from 'web/lib/api/api'

export const FeedPerpPriceSparkline = (props: {
  contract: PerpContract
  className?: string
  height?: number
  emptyState?: ReactNode
  loadingState?: ReactNode
  showSummary?: boolean
  showYAxis?: boolean
}) => {
  const {
    contract,
    className,
    height = 120,
    emptyState,
    loadingState,
    showSummary = false,
    showYAxis = false,
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
    const pad = (yMax - yMin) * 0.1 || Math.max(Math.abs(yMin) * 0.01, 0.01)
    const y = scaleLinear()
      .domain([yMin - pad, yMax + pad])
      .range([chartHeight - 8, 8])
    if (showYAxis) y.nice(3)
    const tickCandidates = showYAxis ? y.ticks(3) : []
    const tickValues =
      tickCandidates.length > 4
        ? [
            tickCandidates[0],
            tickCandidates[Math.floor((tickCandidates.length - 1) / 2)],
            tickCandidates[tickCandidates.length - 1],
          ]
        : tickCandidates
    const tickSteps = tickValues
      .slice(1)
      .map((tick, index) => Math.abs(tick - tickValues[index]))
      .filter((step) => Number.isFinite(step) && step > 0)
    const tickStep =
      tickSteps.length > 0
        ? Math.min(...tickSteps)
        : Math.abs(y.domain()[1] - y.domain()[0])
    const path =
      line<{ ts: number; price: number }>()
        .x((p) => x(p.ts))
        .y((p) => y(p.price))(points) ?? ''
    return path
      ? {
          path,
          chartHeight,
          firstTs: points[0].ts,
          lastTs: points[points.length - 1].ts,
          firstPrice: points[0].price,
          lastPrice: points[points.length - 1].price,
          ticks: tickValues.map((value) => ({ value, y: y(value) })),
          tickStep,
        }
      : ''
  }, [height, points, showSummary, showYAxis])

  if (!chart)
    return points === null ? (
      <>{loadingState ?? null}</>
    ) : (
      <>{emptyState ?? null}</>
    )

  const svg = (
    <svg
      width="100%"
      height={chart.chartHeight}
      viewBox={`0 0 ${width} ${chart.chartHeight}`}
      preserveAspectRatio={showYAxis ? 'none' : undefined}
      className={clsx(
        showYAxis && 'min-w-0 flex-1',
        !showSummary && 'my-4',
        !showSummary && className
      )}
      role="img"
      aria-label={`Seven-day oracle price history from ${formatOraclePriceTick(
        contract.oracleFeedId,
        chart.firstPrice,
        chart.tickStep
      )} to ${formatOraclePriceTick(
        contract.oracleFeedId,
        chart.lastPrice,
        chart.tickStep
      )}`}
    >
      {showYAxis &&
        chart.ticks.map((tick) => (
          <line
            key={tick.value}
            x1={0}
            x2={width}
            y1={tick.y}
            y2={tick.y}
            stroke="currentColor"
            strokeWidth={1}
            strokeOpacity={0.45}
            vectorEffect="non-scaling-stroke"
            className="text-ink-200 dark:text-ink-300"
          />
        ))}
      <path
        d={chart.path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect={showYAxis ? 'non-scaling-stroke' : undefined}
        className="text-primary-500"
      />
    </svg>
  )

  const sparkline = showYAxis ? (
    <div className="flex min-w-0">
      <div
        className="text-ink-400 relative w-[68px] shrink-0 pr-2 text-right text-[10px] tabular-nums leading-none"
        style={{ height: chart.chartHeight }}
        aria-hidden="true"
      >
        {chart.ticks.map((tick) => (
          <span
            key={tick.value}
            className="absolute right-2 -translate-y-1/2"
            style={{ top: tick.y }}
          >
            {formatOraclePriceTick(
              contract.oracleFeedId,
              tick.value,
              chart.tickStep
            )}
          </span>
        ))}
      </div>
      {svg}
    </div>
  ) : (
    svg
  )

  if (!showSummary) return sparkline

  const priceDecimals = inferPriceDecimals([chart.firstPrice, chart.lastPrice])
  const historySpanMs = chart.lastTs - chart.firstTs
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
      <div className="text-ink-400 flex justify-between text-[11px]">
        {showYAxis ? (
          <>
            <span className="ml-[68px]">
              {formatSparklineTimestamp(chart.firstTs, historySpanMs)}
            </span>
            <span>{formatSparklineTimestamp(chart.lastTs, historySpanMs)}</span>
          </>
        ) : (
          <>
            <span className="tabular-nums">
              {formatPrice(chart.firstPrice, priceDecimals)}
            </span>
            <span className="tabular-nums">
              {formatPrice(chart.lastPrice, priceDecimals)}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

const formatSparklineTimestamp = (ts: number, spanMs: number) => {
  const date = new Date(ts)
  return spanMs < DAY_MS
    ? date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
}
