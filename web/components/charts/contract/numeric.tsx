import { useMemo } from 'react'
import { range } from 'lodash'
import { scaleLinear } from 'd3-scale'

import { getDpmOutcomeProbabilities } from 'common/calculate-dpm'
import { NumericContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { DistributionChart } from '../generic-charts'

const MARGIN = { top: 20, right: 40, bottom: 20, left: 10 }
const MARGIN_X = MARGIN.left + MARGIN.right
const MARGIN_Y = MARGIN.top + MARGIN.bottom

const getNumericChartData = (contract: NumericContract) => {
  const { totalShares, bucketCount, min, max } = contract
  const step = (max - min) / bucketCount
  const bucketProbs = getDpmOutcomeProbabilities(totalShares)
  return range(bucketCount).map((i) => ({
    x: min + step * (i + 0.5),
    y: bucketProbs[`${i}`],
  }))
}

export const NumericContractChart = (props: {
  contract: NumericContract
  width: number
  height: number
}) => {
  const { contract, width, height } = props
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
    />
  )
}
