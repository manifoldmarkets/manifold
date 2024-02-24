import { useMemo } from 'react'
import { cloneDeep, keyBy, last } from 'lodash'
import { scaleLinear, scaleTime } from 'd3-scale'
import { getAnswerProbability, getExpectedValue } from 'common/calculate'
import { formatLargeNumber } from 'common/util/format'
import { CPMMNumericContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { getEndDate, getRightmostVisibleDate, ZoomParams } from '../helpers'
import { SingleValueHistoryChart } from '../generic-charts'
import { SingleContractChartTooltip } from './single-value'
import {
  getAnswerColor,
  MultiPoints,
} from 'web/components/charts/contract/choice'
import { HistoryPoint } from 'common/chart'
import { map, mean, zip } from 'd3-array'

// mqp: note that we have an idiosyncratic version of 'log scale'
// contracts. the values are stored "linearly" and can include zero.
// as a result, we have to do some weird-looking stuff in this code

const getScaleP = (min: number, max: number, isLogScale: boolean) => {
  return (p: number) =>
    isLogScale
      ? 10 ** (p * Math.log10(max - min + 1)) + min - 1
      : p * (max - min) + min
}

const getBetPoints = (
  contract: CPMMNumericContract,
  bets: MultiPoints,
  scaleP: (p: number) => number
) => {
  // create answerId : answer text map
  const answerTexts = keyBy(contract.answers, 'id')
  // multiply the prob value by the value of the bucket
  const expectedValues = Object.entries(bets).map(([answerId, pts]) =>
    pts.map((pt) => ({
      x: pt.x,
      y: scaleP(pt.y * parseFloat(answerTexts[answerId].text)),
      obj: pt.obj,
    }))
  )
  return map(zip(...expectedValues), (group) => ({
    y: mean(group.map((pt) => pt.y)) ?? 0,
    x: group[0].x,
    obj: group[0].obj,
  }))
}
type Point = HistoryPoint<never>

export const MultiNumericContractChart = (props: {
  contract: CPMMNumericContract
  multiPoints: MultiPoints
  width: number
  height: number
  zoomParams?: ZoomParams
  showZoomer?: boolean
}) => {
  const { contract, width, multiPoints, height, zoomParams, showZoomer } = props
  const { answers } = contract
  const min = Math.min(...answers.map((a) => parseFloat(a.text)))
  const max = Math.max(...answers.map((a) => parseFloat(a.text)))
  const start = contract.createdTime
  const end = getEndDate(contract)
  const scaleP = useMemo(() => getScaleP(min, max, false), [min, max])
  const startP = scaleP(getExpectedValue(contract, true))
  const endP = scaleP(getExpectedValue(contract))
  const betPoints = useMemo(
    () => getBetPoints(contract, multiPoints, scaleP),
    [multiPoints, scaleP]
  )
  const now = useMemo(() => Date.now(), [multiPoints])

  // TODO: allow user to toggle between distribution and single value
  const distributionData = useMemo(() => {
    const answerOrder = answers.map((a) => a.text)
    const ret = {} as Record<string, { points: Point[]; color: string }>

    answers.forEach((a) => {
      const points = cloneDeep(multiPoints[a.id] ?? [])

      if ('resolution' in a) {
        if (a.resolutionTime) {
          points.push({
            x: a.resolutionTime,
            y: getAnswerProbability(contract, a.id),
          })
        }
      } else {
        points.push({
          x: end ?? now,
          y: getAnswerProbability(contract, a.id),
        })
      }

      const color = getAnswerColor(a, answerOrder)
      ret[a.id] = { points, color }
    })

    return ret
  }, [answers.length, multiPoints, start, end, now])

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
