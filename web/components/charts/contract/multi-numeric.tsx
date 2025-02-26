import { useMemo } from 'react'
import { last, map, sum, zip, keyBy } from 'lodash'
import { scaleLinear, scaleTime } from 'd3-scale'
import { MultiNumericContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { getEndDate, getRightmostVisibleDate, ZoomParams } from '../helpers'
import { SingleValueHistoryChart } from '../generic-charts'
import { SingleContractChartTooltip } from './single-value'

import { MultiPoints } from 'common/chart'
import {
  formatExpectedValue,
  getExpectedValue,
  getMinMax,
} from 'common/src/multi-numeric'
import { getFilledInNumberBetPoints } from 'common/contract-params'

const getBetPoints = (contract: MultiNumericContract, bets: MultiPoints) => {
  const { answers, shouldAnswersSumToOne } = contract
  const answersById = keyBy(answers, 'id')
  const filledInBetPoints = getFilledInNumberBetPoints(bets, contract)
  if (shouldAnswersSumToOne) {
    // multiply the prob value by the value of the bucket
    const expectedValues = Object.entries(filledInBetPoints).map(
      ([answerId, pts]) =>
        pts.map((pt) => ({
          x: pt[0],
          y: pt[1] * answersById[answerId].midpoint!,
        }))
    )
    return map(
      zip(...expectedValues) as Array<{ x: number; y: number }[]>,
      (group) => ({
        y: sum(group.map((pt) => pt.y)) ?? 0,
        x: group[0].x,
      })
    )
  } else {
    // Handle threshold-style expected value calculation
    // First, organize points by timestamp
    const pointsByTimestamp: Record<number, Record<string, number>> = {}

    // Group all probabilities by timestamp
    Object.entries(filledInBetPoints).forEach(([answerId, pts]) => {
      pts.forEach((pt) => {
        const timestamp = pt[0]
        if (!pointsByTimestamp[timestamp]) {
          pointsByTimestamp[timestamp] = {}
        }
        pointsByTimestamp[timestamp][answerId] = pt[1]
      })
    })

    // Calculate expected value at each timestamp
    return Object.entries(pointsByTimestamp)
      .map(([timestamp, probsByAnswer]) => {
        const answerIds = answers.map((a) => a.id)
        const probabilities = answerIds.map((id) => probsByAnswer[id] || 0)

        // Calculate expected value using threshold method
        let expectedValue = 0

        // For each threshold except the last one
        for (let i = 0; i < probabilities.length - 1; i++) {
          // Calculate the probability of being in this "bucket" between thresholds
          const bucketProbability = probabilities[i] - probabilities[i + 1]
          // Add the contribution to the expected value
          expectedValue +=
            answersById[answerIds[i]].midpoint! * bucketProbability
        }

        // Add the contribution from the last threshold
        const lastIndex = probabilities.length - 1
        expectedValue +=
          answersById[answerIds[lastIndex]].midpoint! * probabilities[lastIndex]

        return {
          x: parseInt(timestamp),
          y: expectedValue,
        }
      })
      .sort((a, b) => a.x - b.x) // Sort by timestamp
  }
}

export const MultiNumericContractChart = (props: {
  contract: MultiNumericContract
  multiPoints: MultiPoints
  width: number
  height: number
  zoomParams?: ZoomParams
  showZoomer?: boolean
}) => {
  const { contract, width, multiPoints, height, zoomParams, showZoomer } = props
  const { min, max } = getMinMax(contract)
  const start = contract.createdTime
  const end = getEndDate(contract)
  const endP = getExpectedValue(contract)
  const stringifiedMultiPoints = JSON.stringify(multiPoints)
  const betPoints = useMemo(
    () => getBetPoints(contract, multiPoints),
    [stringifiedMultiPoints]
  )
  const now = useMemo(() => Date.now(), [stringifiedMultiPoints])

  const singlePointData = useMemo(
    () => [
      ...(betPoints || []),
      {
        x: end ?? now,
        y: endP,
      },
    ],
    [JSON.stringify(betPoints), end, endP]
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
      negativeThreshold={min}
      zoomParams={zoomParams}
      showZoomer={showZoomer}
      data={singlePointData}
      Tooltip={(props) => (
        <SingleContractChartTooltip
          ttProps={props}
          xScale={zoomParams?.viewXScale ?? xScale}
          formatY={(y) => formatExpectedValue(y, contract)}
        />
      )}
      color={NUMERIC_GRAPH_COLOR}
    />
  )
}
