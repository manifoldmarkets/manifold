import { DatumValue } from '@nivo/core'
import { Point, ResponsiveLine } from '@nivo/line'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { memo } from 'react'
import { range } from 'lodash'
import { getDpmOutcomeProbabilities } from '../../../common/calculate-dpm'
import { NumericContract } from '../../../common/contract'
import { useWindowSize } from '../../hooks/use-window-size'
import { Col } from '../layout/col'
import { formatLargeNumber } from 'common/util/format'

export const NumericGraph = memo(function NumericGraph(props: {
  contract: NumericContract
  height?: number
}) {
  const { contract, height } = props
  const { totalShares, bucketCount, min, max } = contract

  const bucketProbs = getDpmOutcomeProbabilities(totalShares)

  const xs = range(bucketCount).map(
    (i) => min + ((max - min) * i) / bucketCount
  )
  const probs = range(bucketCount).map((i) => bucketProbs[`${i}`] * 100)
  const points = probs.map((prob, i) => ({ x: xs[i], y: prob }))
  const maxProb = Math.max(...probs)
  const data = [{ id: 'Probability', data: points, color: NUMERIC_GRAPH_COLOR }]

  const yTickValues = [
    0,
    0.25 * maxProb,
    0.5 & maxProb,
    0.75 * maxProb,
    maxProb,
  ]

  const { width } = useWindowSize()

  const numXTickValues = !width || width < 800 ? 2 : 5

  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: height ?? (!width || width >= 800 ? 350 : 250) }}
    >
      <ResponsiveLine
        data={data}
        yScale={{ min: 0, max: maxProb, type: 'linear' }}
        yFormat={formatPercent}
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
        enableSlices="x"
        sliceTooltip={({ slice }) => {
          const point = slice.points[0]
          return <Tooltip point={point} />
        }}
        enableGridX={!!width && width >= 800}
        enableArea
        margin={{ top: 20, right: 28, bottom: 22, left: 50 }}
      />
    </div>
  )
})

function formatPercent(y: DatumValue) {
  const p = Math.round(+y * 100) / 100
  return `${p}%`
}

function Tooltip(props: { point: Point }) {
  const { point } = props
  return (
    <Col className="border border-gray-300 bg-white py-2 px-3">
      <div
        className="pb-1"
        style={{
          color: point.serieColor,
        }}
      >
        <strong>{point.serieId}</strong> {point.data.yFormatted}
      </div>
      <div>{formatLargeNumber(+point.data.x)}</div>
    </Col>
  )
}
