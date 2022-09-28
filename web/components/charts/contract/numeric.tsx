import { useMemo, useRef } from 'react'
import { max, range } from 'lodash'
import { scaleLinear } from 'd3'

import { getDpmOutcomeProbabilities } from 'common/calculate-dpm'
import { NumericContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { MARGIN_X, MARGIN_Y } from '../helpers'
import { SingleValueDistributionChart } from '../generic-charts'
import { useElementWidth } from 'web/hooks/use-element-width'

const getNumericChartData = (contract: NumericContract) => {
  const { totalShares, bucketCount, min, max } = contract
  const step = (max - min) / bucketCount
  const bucketProbs = getDpmOutcomeProbabilities(totalShares)
  return range(bucketCount).map(
    (i) => [min + step * (i + 0.5), bucketProbs[`${i}`]] as const
  )
}

export const NumericContractChart = (props: {
  contract: NumericContract
  height?: number
}) => {
  const { contract } = props
  const data = useMemo(() => getNumericChartData(contract), [contract])
  const isMobile = useIsMobile(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef) ?? 0
  const height = props.height ?? (isMobile ? 150 : 250)
  const maxY = max(data.map((d) => d[1])) as number
  const xScale = scaleLinear(
    [contract.min, contract.max],
    [0, width - MARGIN_X]
  )
  const yScale = scaleLinear([0, maxY], [height - MARGIN_Y, 0])
  return (
    <div ref={containerRef}>
      {width && (
        <SingleValueDistributionChart
          w={width}
          h={height}
          xScale={xScale}
          yScale={yScale}
          data={data}
          color={NUMERIC_GRAPH_COLOR}
        />
      )}
    </div>
  )
}
