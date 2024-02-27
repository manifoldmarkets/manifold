import { BinaryContract } from 'common/contract'
import { useEffect, useState } from 'react'
import { BinaryChart } from '../contract/contract-overview'
import { DAY_MS } from 'common/util/time'
import PlaceholderGraph from 'web/lib/icons/placeholder-graph.svg'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { getBetPoints } from 'common/supabase/bets'
import { db } from 'web/lib/supabase/db'
import { maxBy, minBy } from 'lodash'

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
    getBetPoints(db, contract.id, {
      limit: 1000,
      filterRedemptions: true,
      afterTime: startingDate,
    }).then(setPoints)
  }, [startDate, contract.id])

  const max = maxBy(points, 'y')?.y ?? 1
  const min = minBy(points, 'y')?.y ?? 0

  const percentBounds = { max, min }

  if (points && points.length > 0 && !!points[0]) {
    return (
      <BinaryChart
        betPoints={points}
        contract={contract}
        percentBounds={percentBounds}
        className={className}
        size={'sm'}
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
