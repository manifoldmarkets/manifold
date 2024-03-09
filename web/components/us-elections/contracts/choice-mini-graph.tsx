import { getAnswerProbability } from 'common/calculate'
import { HistoryPoint, MultiPoints } from 'common/chart'
import { CPMMMultiContract, CPMMNumericContract } from 'common/contract'
import { buildArray } from 'common/util/array'
import { scaleLinear, scaleTime } from 'd3-scale'
import { cloneDeep, last, pick } from 'lodash'
import { useMemo } from 'react'
import { getAnswerColor, useChartAnswers } from 'web/components/charts/contract/choice'
import { MultiValueHistoryChart } from 'web/components/charts/generic-charts'
import {
  getEndDate,
  getRightmostVisibleDate,
} from 'web/components/charts/helpers'

export const ChoiceMiniGraph = (props: {
  contract: CPMMMultiContract | CPMMNumericContract
  multiPoints: MultiPoints
  width: number
  height: number
  selectedAnswerIds?: string[]
  startTime?: number
  showMinimumYScale?: boolean
}) => {
  const {
    contract,
    multiPoints = {},
    width,
    height,
    selectedAnswerIds,
    startTime,
    showMinimumYScale,
  } = props

  const start = startTime ?? contract.createdTime

  const end = getEndDate(contract)
  const answers = useChartAnswers(contract)

  const now = useMemo(() => Date.now(), [multiPoints])

  const data = useMemo(() => {
    const answerOrder = answers.map((a) => a.text)
    const ret = {} as Record<
      string,
      { points: HistoryPoint<never>[]; color: string }
    >

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

  const rightestPointX = Math.max(
    ...Object.values(multiPoints).map((p) => last(p)?.x ?? 0)
  )
  const rightmostDate = getRightmostVisibleDate(end, rightestPointX, now)
  const xScale = scaleTime([start, rightmostDate], [0, width])

  const flattenedYValues = (selectedAnswerIds ?? []).flatMap((key) =>
    data[key] ? data[key].points.map((point) => point.y) : []
  )
  const globalMaxY = Math.max(...flattenedYValues)
  const globalMinY = Math.min(...flattenedYValues)
  const yScale = showMinimumYScale
    ? scaleLinear([globalMinY, globalMaxY], [height, 0])
    : scaleLinear([0, 1], [height, 0])

  return (
    <MultiValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      contractId={contract.id}
      data={data}
    />
  )
}
