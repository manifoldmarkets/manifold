import { BinaryContract } from 'common/contract'
import { useEffect, useState } from 'react'
import { DAY_MS } from 'common/util/time'
import PlaceholderGraph from 'web/lib/icons/placeholder-graph.svg'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { buildArray } from 'common/util/array'
import { SizedBinaryChart } from '../charts/contract/binary'
import { getBetPoints } from 'common/bets'

// defaults to the previous day, unless you set a startDate
export function FeedBinaryChart(props: {
  contract: BinaryContract
  startDate?: number
  className?: string
}) {
  const { contract, className, startDate } = props

  const [points, setPoints] = usePersistentInMemoryState<
    { x: number; y: number }[] | null | undefined
  >(undefined, `${contract.id}-feed-chart`)

  // cache the current time so we don't re-render the chart every time
  const [now] = useState(Date.now())
  const startingDate = startDate ? startDate : now - DAY_MS

  useEffect(() => {
    getBetPoints(contract.id, {
      limit: 1000,
      filterRedemptions: true,
      afterTime: startingDate,
    }).then((points) => {
      if (points.length > 0)
        setPoints(
          buildArray([
            startDate != undefined && { x: startDate, y: points[0].y },
            ...points,
          ])
        )
    })
  }, [startDate, contract.id])

  if (points && points.length > 0 && !!points[0]) {
    return (
      <SizedBinaryChart
        betPoints={points}
        contract={contract}
        zoomY
        className={className}
        size={'sm'}
        noWatermark
        startTime={startDate}
      />
    )
  }

  if (points === undefined) {
    return (
      <div
        className="my-2"
        style={{
          height: `${92}px`,
          margin: '20px 40px 20px 10px',
        }}
      >
        <PlaceholderGraph className="text-ink-400 h-full w-full animate-pulse" />
      </div>
    )
  }

  return <></>
}
