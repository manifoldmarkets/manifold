import clsx from 'clsx'
import {
  BinaryContract,
  MultiDateContract,
  MultiNumericContract,
} from 'common/contract'
import { MultiPoints } from 'common/chart'
import { useEffect, useState } from 'react'
import { DAY_MS } from 'common/util/time'
import PlaceholderGraph from 'web/lib/icons/placeholder-graph.svg'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { buildArray } from 'common/util/array'
import { groupBy, mapValues } from 'lodash'
import { SizedBinaryChart } from '../charts/contract/binary'
import { MultiNumericContractChart } from '../charts/contract/multi-numeric'
import { SizedContainer } from '../sized-container'
import { getBetPoints } from 'common/bets'

// defaults to the previous day, unless you set a startDate
export function FeedBinaryChart(props: {
  contract: BinaryContract
  startDate?: number
  className?: string
}) {
  const { contract, className } = props

  const [points, setPoints] = usePersistentInMemoryState<
    { x: number; y: number }[] | null | undefined
  >(undefined, `${contract.id}-feed-chart`)

  // cache the current time so we don't re-render the chart every time
  const [now] = useState(Date.now())
  const startDate = props.startDate ?? now - DAY_MS
  useEffect(() => {
    getBetPoints(contract.id, {
      limit: 1000,
      filterRedemptions: true,
      afterTime: startDate,
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

export function FeedNumericChart(props: {
  contract: MultiNumericContract | MultiDateContract
  className?: string
}) {
  const { contract, className } = props

  const [multiPoints, setMultiPoints] = usePersistentInMemoryState<
    MultiPoints | null | undefined
  >(undefined, `${contract.id}-feed-numeric-chart`)

  useEffect(() => {
    getBetPoints(contract.id, { limit: 1000, filterRedemptions: false }).then(
      (points) => {
        if (points.length > 0) {
          setMultiPoints(
            mapValues(
              groupBy(
                points.filter((p) => p.answerId),
                'answerId'
              ),
              (pts) => pts.map((p) => ({ x: p.x, y: p.y }))
            )
          )
        } else {
          setMultiPoints(null)
        }
      }
    )
  }, [contract.id])

  if (multiPoints && Object.keys(multiPoints).length > 0) {
    return (
      <SizedContainer className={clsx('w-full pb-3 pr-10', className)}>
        {(w, h) => (
          <MultiNumericContractChart
            contract={contract as MultiNumericContract}
            multiPoints={multiPoints}
            width={w}
            height={h}
            zoomY
            noWatermark
            yKind={contract.outcomeType === 'DATE' ? 'date' : undefined}
          />
        )}
      </SizedContainer>
    )
  }

  if (multiPoints === undefined) {
    return (
      <div
        className="my-2"
        style={{ height: '92px', margin: '20px 40px 20px 10px' }}
      >
        <PlaceholderGraph className="text-ink-400 h-full w-full animate-pulse" />
      </div>
    )
  }

  return <></>
}
