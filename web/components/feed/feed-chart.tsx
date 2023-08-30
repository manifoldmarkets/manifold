import { BinaryContract } from 'common/contract'
import { useEffect, useState } from 'react'
import { getHistoryData } from 'web/pages/embed/[username]/[contractSlug]'
import { useViewScale } from '../charts/generic-charts'
import { BinaryChart } from '../contract/contract-overview'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { DAY_MS } from 'common/util/time'

export function FeedBinaryChart(props: {
  contract: BinaryContract
  className?: string
  isNegative: boolean
}) {
  const { contract, className, isNegative } = props

  const [points, setPoints] = useState<
    { x: number; y: number }[] | null | undefined
  >(undefined)
  useEffect(() => {
    getHistoryData(contract, 100, Date.now() - DAY_MS * 2).then((points) => {
      setPoints(points)
    })
  }, [])

  const viewScaleProps = useViewScale()
  if (points) {
    return (
      <BinaryChart
        betPoints={points as any}
        contract={contract}
        showZoomer={false}
        viewScale={viewScaleProps}
        controlledStart={points[0].x}
        className={className}
        size={'sm'}
        color={isNegative ? '#FF7C66' : undefined}
      />
    )
  }

  if (points === undefined) {
    return <LoadingIndicator />
  }

  return <></>
}
