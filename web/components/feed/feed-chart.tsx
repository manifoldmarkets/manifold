import { BinaryContract } from 'common/contract'
import { useEffect, useState } from 'react'
import { getHistoryData } from 'web/pages/embed/[username]/[contractSlug]'
import { useViewScale } from '../charts/generic-charts'
import { BinaryChart } from '../contract/contract-overview'
import { LoadingIndicator } from '../widgets/loading-indicator'

export function FeedBinaryChart(props: {
  contract: BinaryContract
  className?: string
}) {
  const { contract, className } = props

  const [points, setPoints] = useState<
    { x: number; y: number }[] | null | undefined
  >(undefined)
  useEffect(() => {
    getHistoryData(contract, 100).then((points) => {
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
      />
    )
  }

  if (points === undefined) {
    return <LoadingIndicator />
  }

  return <></>
}
