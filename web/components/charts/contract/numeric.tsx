import { useMemo, useRef } from 'react'
import { range } from 'lodash'
import { scaleLinear } from 'd3-scale'

import { formatLargeNumber } from 'common/util/format'
import { getDpmOutcomeProbabilities } from 'common/calculate-dpm'
import { NumericContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { TooltipProps, MARGIN_X, MARGIN_Y, formatPct } from '../helpers'
import { DistributionPoint, DistributionChart } from '../generic-charts'
import { useElementWidth } from 'web/hooks/use-element-width'

const getNumericChartData = (contract: NumericContract) => {
  const { totalShares, bucketCount, min, max } = contract
  const step = (max - min) / bucketCount
  const bucketProbs = getDpmOutcomeProbabilities(totalShares)
  return range(bucketCount).map((i) => ({
    x: min + step * (i + 0.5),
    y: bucketProbs[`${i}`],
  }))
}

const NumericChartTooltip = (props: TooltipProps<DistributionPoint>) => {
  const { x, y } = props.p
  return (
    <>
      <span className="text-semibold">{formatLargeNumber(x)}</span>
      <span className="text-greyscale-6">{formatPct(y, 2)}</span>
    </>
  )
}

export const NumericContractChart = (props: {
  contract: NumericContract
  height?: number
}) => {
  const { contract } = props
  const { min, max } = contract
  const data = useMemo(() => getNumericChartData(contract), [contract])
  const isMobile = useIsMobile(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef) ?? 0
  const height = props.height ?? (isMobile ? 150 : 250)
  const maxY = Math.max(...data.map((d) => d.y))
  const xScale = scaleLinear([min, max], [0, width - MARGIN_X])
  const yScale = scaleLinear([0, maxY], [height - MARGIN_Y, 0])
  return (
    <div ref={containerRef}>
      {width > 0 && (
        <DistributionChart
          w={width}
          h={height}
          xScale={xScale}
          yScale={yScale}
          data={data}
          color={NUMERIC_GRAPH_COLOR}
          Tooltip={NumericChartTooltip}
        />
      )}
    </div>
  )
}
