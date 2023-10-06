import { useMemo } from 'react'
import { cloneDeep, groupBy, last, mapKeys, mapValues, sortBy } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'
import { Bet } from 'common/bet'
import { Answer, DpmAnswer } from 'common/answer'
import { CPMMMultiContract, MultiContract } from 'common/contract'
import { getAnswerProbability } from 'common/calculate'
import {
  TooltipProps,
  formatDateInRange,
  formatPct,
  getDateRange,
  getRightmostVisibleDate,
} from '../helpers'
import { MultiValueHistoryChart } from '../generic-charts'
import { HistoryPoint } from 'common/chart'
import { Row } from 'web/components/layout/row'

const CHOICE_ANSWER_COLORS = [
  '#99DDFF', // sky
  '#FFDD99', // sand
  '#FFAABB', // pink
  '#77AADD', // navy
  '#9932CC', // 🍆
  '#C70020', // blood red
  '#FF8C00', // orange
  '#44BB99', // forest
  '#FFD700', // gold
  '#7FFF00', // chartreuse
  '#EE8866', // orange-red
  '#9F00C5', // Grimace
  '#FF8900', // octarine
  '#EEDD88', // yellow
  '#3498DB', // Blue
  '#2ECC71', // Green
  '#F1C40F', // Yellow
  '#9B59B6', // Purple
  '#E67E22', // Orange
  '#90BE6D', // Green
  '#FFA500', // Orange
  '#FFC0CB', // Pink
  '#FF69B4', // Hot Pink
  '#F9C74F', // Yellow
  '#FF6B6B', // Red
  '#FF9F1C', // Orange
  '#D3A8FF', // Purple
  '#FFCCD5', // Pink
  '#6EE7B7', // Cyan
  '#F97171', // Salmon
  '#A3DE83', // Pistachio
  '#FFD166', // Apricot
  '#B8D8B8', // Pale Green
  '#FF85A1', // Watermelon
  '#AFE3E7', // Baby Blue
  '#FFBF69', // Peach
  '#C3CED0', // Silver Blue
  '#FFA69E', // Coral
  '#DBD56E', // Mustard
]
// const CHOICE_OTHER_COLOR = '#B1B1C7'

export const nthColor = (index: number) =>
  CHOICE_ANSWER_COLORS[index % CHOICE_ANSWER_COLORS.length]

const getAnswers = (contract: MultiContract) => {
  const { answers, outcomeType } = contract
  const validAnswers = (answers ?? []).filter(
    (answer) => answer.id !== '0' || outcomeType === 'MULTIPLE_CHOICE'
  )
  return sortBy(validAnswers, (answer) =>
    'index' in answer
      ? answer.index
      : -1 * getAnswerProbability(contract, answer.id)
  )
}

type Point = HistoryPoint<never>
export type MultiPoints = { [answerId: string]: Point[] }

// new multi only
export const getMultiBetPoints = (bets: Bet[]) => {
  return mapValues(groupBy(bets, 'answerId'), (bets) =>
    bets.map((bet) => ({ x: bet.createdTime, y: bet.probAfter }))
  )
}

export function useChartAnswers(contract: MultiContract) {
  return useMemo(() => getAnswers(contract), [contract])
}

export const ChoiceContractChart = (props: {
  contract: CPMMMultiContract
  multiPoints?: MultiPoints
  width: number
  height: number
}) => {
  const { contract, multiPoints = {}, width, height } = props

  const [start, end] = getDateRange(contract)
  const answers = useChartAnswers(contract)

  const endProbs = useMemo(
    () => answers.map((a) => getAnswerProbability(contract, a.id)),
    [answers, contract]
  )

  const now = useMemo(() => Date.now(), [multiPoints])

  const data = useMemo(() => {
    if (!answers.length) return []

    const firstAnswerTime = answers[0].createdTime
    const startAnswers = answers.filter(
      (a) => a.createdTime <= firstAnswerTime + 1000
    )

    const startP = 1 / startAnswers.length

    const pointsById = cloneDeep(multiPoints)
    mapKeys(pointsById, (points, answerId) => {
      const y = startAnswers.some((a) => a.id === answerId) ? startP : 0
      points.unshift({ x: start, y })
    })

    mapKeys(pointsById, (points, answerId) => {
      points.push({
        x: end ?? now,
        y: getAnswerProbability(contract, answerId),
      })
    })

    return answers.map((a) => pointsById[a.id] ?? [])
  }, [answers.length, multiPoints, endProbs, start, end, now])

  const rightestPointX = Math.max(
    ...Object.values(multiPoints).map((p) => last(p)?.x ?? 0)
  )
  const rightmostDate = getRightmostVisibleDate(end, rightestPointX, now)
  const xScale = scaleTime([start, rightmostDate], [0, width])
  const yScale = scaleLinear([0, 1], [height, 0])

  return (
    <MultiValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      yKind="percent"
      data={data}
      Tooltip={(props) => (
        <ChoiceTooltip answers={answers} xScale={xScale} ttProps={props} />
      )}
    />
  )
}

const ChoiceTooltip = (props: {
  ttProps: TooltipProps<HistoryPoint> & { i: number }
  xScale: any
  answers: (DpmAnswer | Answer)[]
}) => {
  const { ttProps, xScale, answers } = props
  const { prev, next, x, i } = ttProps

  if (!prev) return null

  const [start, end] = xScale.domain()

  const d = xScale.invert(x)

  const answer = answers[i]?.text ?? 'Other'
  const value = formatPct(prev.y)

  const dateLabel = !next ? 'Now' : formatDateInRange(d, start, end)

  return (
    <>
      <span className="font-semibold">{dateLabel}</span>
      <div className="flex max-w-xs flex-row justify-between gap-4">
        <Row className="items-center gap-2 overflow-hidden">
          <span className="overflow-hidden text-ellipsis">{answer}</span>
        </Row>
        <span className="text-ink-600">{value}</span>
      </div>
    </>
  )
}
