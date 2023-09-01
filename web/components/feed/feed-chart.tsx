import { BinaryContract } from 'common/contract'
import { useEffect } from 'react'
import { getHistoryData } from 'web/pages/embed/[username]/[contractSlug]'
import { useViewScale } from '../charts/generic-charts'
import { BinaryChart } from '../contract/contract-overview'
import { DAY_MS } from 'common/util/time'
import PlaceholderGraph from 'web/lib/icons/placeholder-graph'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export function FeedBinaryChart(props: {
  contract: BinaryContract
  className?: string
}) {
  const { contract, className } = props

  const [points, setPoints] = usePersistentInMemoryState<
    { x: number; y: number }[] | null | undefined
  >(undefined, `${contract.id}-feed-chart`)

  const startingDate = Date.now() - DAY_MS

  useEffect(() => {
    getHistoryData(contract, 100, startingDate).then((fetchedPoints) => {
      if (fetchedPoints && fetchedPoints.length > 0 && !!fetchedPoints[0]) {
        const createdAfterStartingDate = contract.createdTime > startingDate
        const graphedPoints = [
          {
            x: createdAfterStartingDate ? contract.createdTime : startingDate,
            y: createdAfterStartingDate
              ? contract.initialProbability
              : fetchedPoints[0].yBefore,
          },
          ...fetchedPoints?.map((point) => ({ x: point.x, y: point.y })),
        ]

        setPoints(graphedPoints)
      }
    })
  }, [])

  const percentBounds = points
    ? points.reduce(
        (acc, point) => ({
          max: Math.max(acc.max, point.y),
          min: Math.min(acc.min, point.y),
        }),
        { max: Number.NEGATIVE_INFINITY, min: Number.POSITIVE_INFINITY }
      )
    : undefined
  const viewScaleProps = useViewScale()

  if (points && points.length > 0 && !!points[0]) {
    return (
      <BinaryChart
        betPoints={points as any}
        contract={contract}
        showZoomer={false}
        viewScale={viewScaleProps}
        controlledStart={points[0].x}
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
