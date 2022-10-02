import { useMemo } from 'react'
import { range } from 'lodash'
import { scaleLinear } from 'd3-scale'

import { formatLargeNumber } from 'common/util/format'
import { getDpmOutcomeProbabilities } from 'common/calculate-dpm'
import { NumericContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { TooltipProps, MARGIN_X, MARGIN_Y, formatPct } from '../helpers'
import { DistributionPoint, DistributionChart } from '../generic-charts'

const getNumericChartData = (contract: NumericContract) => {
  const { totalShares, bucketCount, min, max } = contract
  const step = (max - min) / bucketCount
  const bucketProbs = getDpmOutcomeProbabilities(totalShares)
  return range(bucketCount).map((i) => ({
    x: min + step * (i + 0.5),
    y: bucketProbs[`${i}`],
  }))
}

const NumericChartTooltip = (
  props: TooltipProps<number, DistributionPoint>
) => {
  const { data, mouseX, xScale } = props
  const x = xScale.invert(mouseX)
  return (
    <>
      <span className="text-semibold">{formatLargeNumber(x)}</span>
      <span className="text-greyscale-6">{formatPct(data.y, 2)}</span>
    </>
  )
}

export const NumericContractChart = (props: {
  contract: NumericContract
  width: number
  height: number
  onMouseOver?: (p: DistributionPoint | undefined) => void
}) => {
  const { contract, width, height, onMouseOver } = props
  const { min, max } = contract
  const data = useMemo(() => getNumericChartData(contract), [contract])
  const maxY = Math.max(...data.map((d) => d.y))
  const xScale = scaleLinear([min, max], [0, width - MARGIN_X])
  const yScale = scaleLinear([0, maxY], [height - MARGIN_Y, 0])
  return (
    <DistributionChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      data={data}
      color={NUMERIC_GRAPH_COLOR}
      onMouseOver={onMouseOver}
      Tooltip={NumericChartTooltip}
    />
  )
}
