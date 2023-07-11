import { useMemo } from 'react'
import { last, sum, sortBy, groupBy } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'
import { curveStepAfter } from 'd3-shape'
import { Bet } from 'common/bet'
import { DpmAnswer } from 'common/answer'
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
import { MultiPoint } from 'common/chart'

const CHOICE_ANSWER_COLORS = [
  '#77AADD',
  '#EE8866',
  '#EEDD88',
  '#FFAABB',
  '#99DDFF',
  '#44BB99',
  '#BBCC33',
]
const CHOICE_OTHER_COLOR = '#B1B1C7'

export const nthColor = (index: number) =>
  CHOICE_ANSWER_COLORS[index] ?? CHOICE_OTHER_COLOR

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

const getDpmBetPoints = (answers: DpmAnswer[], bets: Bet[]) => {
  const sortedBets = sortBy(bets, (b) => b.createdTime)
  const betsByOutcome = groupBy(sortedBets, (bet) => bet.outcome)
  const sharesByOutcome = Object.fromEntries(
    Object.keys(betsByOutcome).map((outcome) => [outcome, 0])
  )
  const points: MultiPoint<Bet>[] = []
  for (const bet of sortedBets) {
    const { outcome, shares } = bet
    sharesByOutcome[outcome] += shares

    const sharesSquared = sum(
      Object.values(sharesByOutcome).map((shares) => shares ** 2)
    )
    const probs = answers.map((a) => sharesByOutcome[a.id] ** 2 / sharesSquared)

    points.push({ x: bet.createdTime, y: probs, obj: bet })
  }
  return points
}

export function useChartAnswers(contract: MultiContract) {
  return useMemo(() => getAnswers(contract), [contract])
}

export const ChoiceContractChart = (props: {
  contract: MultiContract
  bets?: Bet[]
  points?: MultiPoint[]
  width: number
  height: number
  onMouseOver?: (p: MultiPoint | undefined) => void
}) => {
  const { contract, bets = [], points = [], width, height, onMouseOver } = props
  const isMultipleChoice = contract.outcomeType === 'MULTIPLE_CHOICE'
  const isDpm = contract.mechanism === 'dpm-2'
  const [start, end] = getDateRange(contract)
  const answers = useChartAnswers(contract)

  const betPoints = useMemo(
    () => (isDpm ? getDpmBetPoints(answers as DpmAnswer[], bets) : points),
    [answers, bets, isDpm, points]
  )
  const endProbs = useMemo(
    () => answers.map((a) => getAnswerProbability(contract, a.id)),
    [answers, contract]
  )

  const now = useMemo(() => Date.now(), [betPoints])

  const data = useMemo(() => {
    if (!answers.length) return []

    const startY: number[] = new Array(answers.length).fill(1 / answers.length)

    return buildArray(isMultipleChoice && { x: start, y: startY }, betPoints, {
      x: end ?? now,
      y: endProbs,
    })
  }, [answers.length, betPoints, endProbs, start, end, now])

  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)
  const visibleRange = [start, rightmostDate]
  const xScale = scaleTime(visibleRange, [0, width])
  const yScale = scaleLinear([0, 1], [height, 0])

  const ChoiceTooltip = useMemo(
    () => (props: TooltipProps<Date, MultiPoint>) => {
      const { prev, x, y, xScale, yScale } = props
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
          <span className="font-semibold">
            {formatDateInRange(d, start, end)}
          </span>
          <div className="flex max-w-xs flex-row justify-between gap-4">
            <Row className="items-center gap-2 overflow-hidden">
              <span className="overflow-hidden text-ellipsis">{answer}</span>
            </Row>
            <span className="text-ink-600">{value}</span>
          </div>
        </>
      )
    },
    [answers]
  )

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
      Tooltip={ChoiceTooltip}
    />
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
