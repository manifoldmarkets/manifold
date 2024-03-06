import { useMemo } from 'react'
import { keyBy, last, sum } from 'lodash'
import { scaleLinear, scaleTime } from 'd3-scale'
import { formatLargeNumber } from 'common/util/format'
import { CPMMNumericContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { getEndDate, getRightmostVisibleDate, ZoomParams } from '../helpers'
import { SingleValueHistoryChart } from '../generic-charts'
import { SingleContractChartTooltip } from './single-value'
import { MultiPoints } from 'web/components/charts/contract/choice'
import { map, zip } from 'd3-array'
import {
  getExpectedValue,
  getMultiNumericAnswerToMidpoint,
} from 'common/multi-numeric'

const getBetPoints = (contract: CPMMNumericContract, bets: MultiPoints) => {
  // create answerId : answer text map
  const answerTexts = keyBy(contract.answers, 'id')
  // multiply the prob value by the value of the bucket
  const expectedValues = Object.entries(bets).map(([answerId, pts]) =>
    pts.map((pt) => ({
      x: pt.x,
      y: pt.y * getMultiNumericAnswerToMidpoint(answerTexts[answerId].text),
      obj: pt.obj,
    }))
  )
  return map(zip(...expectedValues), (group) => ({
    y: sum(group.map((pt) => pt.y)) ?? 0,
    x: group[0].x,
    obj: group[0].obj,
  }))
}

export const MultiNumericContractChart = (props: {
  contract: CPMMNumericContract
  multiPoints: MultiPoints
  width: number
  height: number
  zoomParams?: ZoomParams
  showZoomer?: boolean
}) => {
  const { contract, width, multiPoints, height, zoomParams, showZoomer } = props
  const { min, max } = contract
  const start = contract.createdTime
  const end = getEndDate(contract)
  const startP = getExpectedValue(contract, true)
  const endP = getExpectedValue(contract)
  const betPoints = useMemo(
    () => getBetPoints(contract, multiPoints),
    [multiPoints]
  )
  const now = useMemo(() => Date.now(), [multiPoints])

  const singlePointData = useMemo(
    () => [{ x: start, y: startP }, ...betPoints, { x: end ?? now, y: endP }],
    [betPoints, start, startP, end, endP]
  )
  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)
  const xScale = scaleTime([start, rightmostDate], [0, width])

  // clamp log scale to make sure zeroes go to the bottom
  const yScale = scaleLinear([min, max], [height, 0])
  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      zoomParams={zoomParams}
      showZoomer={showZoomer}
      data={singlePointData}
      Tooltip={(props) => (
        <SingleContractChartTooltip
          ttProps={props}
          xScale={zoomParams?.viewXScale ?? xScale}
          formatY={formatLargeNumber}
        />
      )}
      color={NUMERIC_GRAPH_COLOR}
    />
  )
}
