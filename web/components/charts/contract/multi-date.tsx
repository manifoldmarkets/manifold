import { useMemo } from 'react'
import { last, map, max, sum, zip, min, keyBy } from 'lodash'
import { scaleLinear, scaleTime } from 'd3-scale'
import { MultiDateContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { getEndDate, getRightmostVisibleDate, ZoomParams } from '../helpers'
import { SingleValueHistoryChart } from '../generic-charts'
import { SingleContractChartTooltip } from './single-value'

import { MultiPoints } from 'common/chart'
import { getMinMax } from 'common/src/multi-numeric'
import { formatExpectedDate, getExpectedDate } from 'common/multi-date'
import { getAnswerProbAtEveryBetTime } from 'common/contract-params'

export const getDateBetPoints = (
  contract: MultiDateContract,
  bets: MultiPoints
) => {
  const { answers, shouldAnswersSumToOne } = contract
  const answersById = keyBy(answers, 'id')
  const filledInBetPoints = getAnswerProbAtEveryBetTime(bets, contract)
  if (shouldAnswersSumToOne) {
    // multiply the prob value by the value of the bucket
    const expectedValues = Object.entries(filledInBetPoints).map(
      ([answerId, pts]) =>
        pts.map((pt) => ({
          x: pt.x,
          y: pt.y * answersById[answerId].midpoint!,
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
        const timestamp = pt.x
        if (!pointsByTimestamp[timestamp]) {
          pointsByTimestamp[timestamp] = {}
        }
        pointsByTimestamp[timestamp][answerId] = pt.y
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
          const bucketProbability =
            i === 0
              ? probabilities[i] // First threshold
              : probabilities[i] - probabilities[i - 1] // Difference between thresholds

          // Add the contribution to the expected value
          expectedValue +=
            answersById[answerIds[i]].midpoint! * bucketProbability
        }

        // Calculate the tail probability (events after the last threshold)
        const lastIndex = probabilities.length - 1
        const lastThresholdProb = probabilities[lastIndex]
        const prevThresholdProb =
          lastIndex > 0 ? probabilities[lastIndex - 1] : 0

        // Probability of the last discrete bucket
        const lastBucketProb = lastThresholdProb - prevThresholdProb
        expectedValue +=
          answersById[answerIds[lastIndex]].midpoint! * lastBucketProb

        // Handle probability beyond the last threshold (tail probability)
        const tailProb = 1 - lastThresholdProb
        if (tailProb > 0) {
          const lastMidpoint = answersById[answerIds[lastIndex]].midpoint!
          const prevMidpoint = answersById[answerIds[lastIndex - 1]].midpoint!
          const timePeriod = lastMidpoint - prevMidpoint
          const beyondLastMidpoint = lastMidpoint + timePeriod

          // Add the contribution from events beyond the last threshold
          expectedValue += beyondLastMidpoint * tailProb
        }

        return {
          x: parseInt(timestamp),
          y: expectedValue,
        }
      })
      .sort((a, b) => a.x - b.x) // Sort by timestamp
  }
}

export const MultiDateContractChart = (props: {
  contract: MultiDateContract
  multiPoints: MultiPoints
  width: number
  height: number
  zoomParams?: ZoomParams
  showZoomer?: boolean
}) => {
  const { contract, width, multiPoints, height, zoomParams, showZoomer } = props
  const start = contract.createdTime
  const end = getEndDate(contract)
  const endP = getExpectedDate(contract)
  const stringifiedMultiPoints = JSON.stringify(multiPoints)
  const betPoints = useMemo(
    () => getDateBetPoints(contract, multiPoints),
    [stringifiedMultiPoints]
  )
  const now = useMemo(() => Date.now(), [stringifiedMultiPoints, endP])

  const singlePointData = useMemo(
    () => [
      ...(betPoints || []),
      {
        x: end ?? now,
        y: endP,
      },
    ],
    [betPoints, end, endP, now]
  )
  const { min: answerMin, max: answerMax } = getMinMax(contract)
  const allYs = singlePointData.map((p) => p.y)
  const minY = min([...allYs, answerMin])!
  const maxY = max([...allYs, answerMax])!
  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)
  const xScale = scaleTime([start, rightmostDate], [0, width])

  // Scale for dates on Y-axis (time values in milliseconds)
  const yScale = scaleLinear([minY, maxY], [height, 0])

  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      rightmostDate={rightmostDate}
      negativeThreshold={minY}
      zoomParams={zoomParams}
      showZoomer={showZoomer}
      data={singlePointData}
      Tooltip={(props) => (
        <SingleContractChartTooltip
          ttProps={props}
          xScale={zoomParams?.viewXScale ?? xScale}
          formatY={(y) => formatExpectedDate(y, contract)}
        />
      )}
      color={NUMERIC_GRAPH_COLOR}
      yKind="date"
    />
  )
}
