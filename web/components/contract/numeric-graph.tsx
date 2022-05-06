import { DatumValue } from '@nivo/core'
import { ResponsiveLine } from '@nivo/line'
import _ from 'lodash'
import { memo } from 'react'
import { getDpmOutcomeProbabilities } from '../../../common/calculate-dpm'
import { NumericContract } from '../../../common/contract'
import { useWindowSize } from '../../hooks/use-window-size'

export const NumericGraph = memo(function NumericGraph(props: {
  contract: NumericContract
  height?: number
}) {
  const { contract, height } = props
  const { totalShares, bucketCount, min, max } = contract

  const bucketProbs = getDpmOutcomeProbabilities(totalShares)

  const xs = _.range(bucketCount).map(
    (i) => min + ((max - min) * i) / bucketCount
  )
  const probs = _.range(bucketCount).map((i) => bucketProbs[`${i}`])
  const points = probs.map((prob, i) => ({ x: xs[i], y: prob * 100 }))
  const data = [{ id: 'Probability', data: points, color: '#b91181' }]

  const yTickValues = [0, 25, 50, 75, 100]

  const { width } = useWindowSize()

  const numXTickValues = !width || width < 800 ? 2 : 5

  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: height ?? (!width || width >= 800 ? 350 : 250) }}
    >
      <ResponsiveLine
        data={data}
        yScale={{ min: 0, max: 100, type: 'linear' }}
        yFormat={formatPercent}
        gridYValues={yTickValues}
        axisLeft={{
          tickValues: yTickValues,
          format: formatPercent,
        }}
        xScale={{
          type: 'linear',
          min: min,
          max: max,
        }}
        xFormat={(d) => `${Math.round(+d * 100) / 100}`}
        axisBottom={{
          tickValues: numXTickValues,
          format: (d) => `${Math.round(+d * 100) / 100}`,
        }}
        colors={{ datum: 'color' }}
        pointSize={0}
        pointBorderWidth={1}
        pointBorderColor="#fff"
        enableSlices="x"
        enableGridX={!!width && width >= 800}
        enableArea
        margin={{ top: 20, right: 28, bottom: 22, left: 40 }}
      />
    </div>
  )
})

function formatPercent(y: DatumValue) {
  return `${Math.round(+y.toString())}%`
}
