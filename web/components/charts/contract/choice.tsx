import { useMemo } from 'react'
import { last, sortBy } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'
import { curveStepAfter } from 'd3-shape'
import { Bet, calculateMultiBets } from 'common/bet'
import { Answer, DpmAnswer } from 'common/answer'
import { MultiContract } from 'common/contract'
import { getAnswerProbability } from 'common/calculate'
import {
  TooltipProps,
  getDateRange,
  getRightmostVisibleDate,
  formatPct,
  formatDateInRange,
} from '../helpers'
import { MultiValueHistoryChart } from '../generic-charts'
import { Row } from 'web/components/layout/row'
import { buildArray } from 'common/util/array'
import { MultiPoint, unserializePoints } from 'common/chart'

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

// new multi only
export const getMultiBetPoints = (answers: Answer[], bets: Bet[]) => {
  return unserializePoints(
    calculateMultiBets(
      bets.map((b) => ({ x: b.createdTime, y: b.probAfter, ...b })),
      answers.map((a) => a.id)
    )
  )
}

export function useChartAnswers(contract: MultiContract) {
  return useMemo(() => getAnswers(contract), [contract])
}

export const ChoiceContractChart = (props: {
  contract: MultiContract
  points?: MultiPoint[]
  width: number
  height: number
  onMouseOver?: (p: MultiPoint | undefined) => void
}) => {
  const { contract, points = [], width, height, onMouseOver } = props
  const isMultipleChoice = contract.outcomeType === 'MULTIPLE_CHOICE'

  const [start, end] = getDateRange(contract)
  const answers = useChartAnswers(contract)

  const endProbs = useMemo(
    () => answers.map((a) => getAnswerProbability(contract, a.id)),
    [answers, contract]
  )

  const now = useMemo(() => Date.now(), [points])

  const data = useMemo(() => {
    if (!answers.length) return []

    const firstAnswerTime = answers[0].createdTime
    const startAnswers = answers.filter(
      (a) => a.createdTime <= firstAnswerTime + 1000
    )
    const startY: number[] = [
      ...new Array(startAnswers.length).fill(1 / startAnswers.length),
      ...new Array(answers.length - startAnswers.length).fill(0),
    ]

    return buildArray(isMultipleChoice && { x: start, y: startY }, points, {
      x: end ?? now,
      y: endProbs,
    })
  }, [answers.length, points, endProbs, start, end, now])

  const rightmostDate = getRightmostVisibleDate(end, last(points)?.x, now)
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
      curve={curveStepAfter}
      onMouseOver={onMouseOver}
      Tooltip={(props) => <ChoiceTooltip answers={answers} ttProps={props} />}
    />
  )
}

const ChoiceTooltip = (props: {
  ttProps: TooltipProps<Date, MultiPoint>
  answers: (DpmAnswer | Answer)[]
}) => {
  const { ttProps, answers } = props
  const { prev, x, y, xScale, yScale } = ttProps
  const [start, end] = xScale.domain()

  if (!yScale) return null
  if (!prev) return null

  const d = xScale.invert(x)
  const prob = yScale.invert(y)

  const index = cum(prev.y).findIndex((p) => p >= 1 - prob)
  const answer = answers[index]?.text ?? 'Other'
  const value = formatPct(prev.y[index])

  return (
    <>
      <span className="font-semibold">{formatDateInRange(d, start, end)}</span>
      <div className="flex max-w-xs flex-row justify-between gap-4">
        <Row className="items-center gap-2 overflow-hidden">
          <span className="overflow-hidden text-ellipsis">{answer}</span>
        </Row>
        <span className="text-ink-600">{value}</span>
      </div>
    </>
  )
}

const cum = (numbers: number[]) => {
  const result = []
  let sum = 0
  for (const n of numbers) {
    sum += n
    result.push(sum)
  }
  return result
}
