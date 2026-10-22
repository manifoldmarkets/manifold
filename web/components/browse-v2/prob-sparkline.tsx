import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import clsx from 'clsx'
import { getBetPoints } from 'common/bets'
import { getDisplayProbability } from 'common/calculate'
import { BinaryContract } from 'common/contract'
import { WEEK_MS } from 'common/util/time'
import { useEffect, useId, useState } from 'react'

import { useIsVisible } from 'web/hooks/use-is-visible'

type Point = { x: number; y: number }

// Last 7 days of probability (or since creation), fetched once the card is on
// screen so a page of cards doesn't fire a request per market up front.
export function ProbSparkline(props: {
  contract: BinaryContract
  className?: string
}) {
  const { contract, className } = props
  const [now] = useState(() => Date.now())
  const start = Math.max(contract.createdTime, now - WEEK_MS)
  const [points, setPoints] = usePersistentInMemoryState<
    Point[] | null | undefined
  >(undefined, `browse-v2-spark-${contract.id}`)
  const [visible, setVisible] = useState(false)
  const { ref } = useIsVisible(() => setVisible(true), true)

  useEffect(() => {
    if (!visible || points !== undefined) return
    let cancelled = false
    getBetPoints(contract.id, {
      limit: 400,
      filterRedemptions: true,
      afterTime: start,
    })
      .then((pts) => {
        if (!cancelled) setPoints(pts.map((p) => ({ x: p.x, y: p.y })))
      })
      .catch(() => {
        if (!cancelled) setPoints(null)
      })
    return () => {
      cancelled = true
    }
  }, [visible, contract.id])

  const current = getDisplayProbability(contract)
  return (
    <div ref={ref} className={clsx('relative h-10 w-full', className)}>
      {points === undefined ? (
        <div className="bg-ink-100 absolute inset-0 animate-pulse rounded" />
      ) : (
        <SparklinePath
          points={points ?? []}
          start={start}
          end={now}
          current={current}
        />
      )}
    </div>
  )
}

function SparklinePath(props: {
  points: Point[]
  start: number
  end: number
  current: number
}) {
  const { start, end, current } = props
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const valid = props.points.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y)
  )
  // No trades in the window: the price sat where it is now.
  const first = valid[0]?.y ?? current
  const series: Point[] = [
    { x: start, y: first },
    ...valid.filter((p) => p.x >= start && p.x <= end),
    { x: end, y: Number.isFinite(current) ? current : first },
  ]
  const ys = series.map((p) => p.y)
  let lo = Math.min(...ys)
  let hi = Math.max(...ys)
  // Zoom in, but never so far that a one-point wiggle fills the box.
  const minSpan = 0.08
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2
    lo = mid - minSpan / 2
    hi = mid + minSpan / 2
  }
  lo = Math.max(0, lo - (hi - lo) * 0.1)
  hi = Math.min(1, hi + (hi - lo) * 0.1)
  const span = end - start || 1
  const sx = (x: number) => ((x - start) / span) * 100
  const sy = (y: number) => 30 - ((y - lo) / (hi - lo || 1)) * 28
  // Step line: the price holds until the next trade.
  let d = `M ${sx(series[0].x)} ${sy(series[0].y)}`
  for (let i = 1; i < series.length; i++) {
    d += ` H ${sx(series[i].x)} V ${sy(series[i].y)}`
  }
  const area = `${d} V 32 H 0 Z`
  const up = series[series.length - 1].y >= series[0].y
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className={clsx(
        'absolute inset-0 h-full w-full overflow-visible',
        up ? 'text-teal-500' : 'text-scarlet-500'
      )}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
