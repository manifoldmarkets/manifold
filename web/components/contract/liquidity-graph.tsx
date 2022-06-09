import { CartesianMarkerProps, DatumValue } from '@nivo/core'
import { Point, ResponsiveLine } from '@nivo/line'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { memo } from 'react'
import { range } from 'lodash'
import { getDpmOutcomeProbabilities } from '../../../common/calculate-dpm'
import { NumericContract } from '../../../common/contract'
import { useWindowSize } from '../../hooks/use-window-size'
import { Col } from '../layout/col'
import { formatLargeNumber, formatPercent } from 'common/util/format'

export type GraphPoint = {
  // A probability between 0 and 1
  x: number
  // Amount of liquidity
  y: number
}

export const LiquidityGraph = memo(function NumericGraph(props: {
  min?: 0
  max?: 1
  points: GraphPoint[]
  height?: number
  marker?: number // Value between min and max to highlight on x-axis
  previewMarker?: number
}) {
  const { height, min, max, points, marker, previewMarker } = props

  // Really maxLiquidity
  const maxLiquidity = 500
  const data = [{ id: 'Probability', data: points, color: NUMERIC_GRAPH_COLOR }]

  const yTickValues = [
    0,
    0.25 * maxLiquidity,
    0.5 * maxLiquidity,
    0.75 * maxLiquidity,
    maxLiquidity,
  ]

  const { width } = useWindowSize()

  const numXTickValues = !width || width < 800 ? 2 : 5

  const markers: CartesianMarkerProps<DatumValue>[] = []
  if (marker) {
    markers.push({
      axis: 'x',
      value: marker,
      lineStyle: { stroke: '#000', strokeWidth: 2 },
      legend: `Implied: ${formatPercent(marker)}`,
    })
  }
  if (previewMarker) {
    markers.push({
      axis: 'x',
      value: previewMarker,
      lineStyle: { stroke: '#8888', strokeWidth: 2 },
    })
  }

  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: height ?? (!width || width >= 800 ? 350 : 250) }}
    >
      <ResponsiveLine
        data={data}
        yScale={{ min: 0, max: maxLiquidity, type: 'linear' }}
        yFormat={formatLiquidity}
        axisLeft={{
          tickValues: yTickValues,
          format: formatLiquidity,
        }}
        xScale={{
          type: 'linear',
          min: min,
          max: max,
        }}
        xFormat={(d) => `${formatLargeNumber(+d, 3)}`}
        axisBottom={{
          tickValues: numXTickValues,
          format: (d) => `${formatLargeNumber(+d, 3)}`,
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
        markers={markers}
      />
    </div>
  )
})

function formatLiquidity(y: DatumValue) {
  const p = Math.round(+y * 100) / 100
  return `${p}L`
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
