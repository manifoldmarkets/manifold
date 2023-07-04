import { useMemo } from 'react'
import { last, range, sum, sortBy, groupBy } from 'lodash'
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
import { DAY_MS } from 'common/util/time'

export const CHOICE_ANSWER_COLORS = [
  '#77AADDB3',
  '#EE8866B3',
  '#EEDD88B3',
  '#FFAABBB3',
  '#99DDFFB3',
  '#44BB99B3',
  '#BBCC33B3',
]
export const CHOICE_OTHER_COLOR = '#B1B1C7B3'
export const CHOICE_ALL_COLORS = [...CHOICE_ANSWER_COLORS, CHOICE_OTHER_COLOR]


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

const getDpmBetPoints = (answers: DpmAnswer[], bets: Bet[], topN?: number) => {
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

    if (topN != null && answers.length > topN) {
      const y = [...probs.slice(0, topN), sum(probs.slice(topN))]
      points.push({ x: bet.createdTime, y, obj: bet })
    } else {
      points.push({ x: bet.createdTime, y: probs, obj: bet })
    }
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
  const topN = Math.min(CHOICE_ANSWER_COLORS.length, answers.length)
  const betPoints = useMemo(
    () =>
      isDpm ? getDpmBetPoints(answers as DpmAnswer[], bets, topN) : points,

    [answers, bets, topN, isDpm, points]
  )
  const endProbs = useMemo(
    () => answers.map((a) => getAnswerProbability(contract, a.id)),
    [answers, contract]
  )

  const data = useMemo(() => {
    const startY = buildArray(
      range(0, topN).map(() => 1 / answers.length),
      answers.length > topN ? 1 - topN / answers.length : undefined
    )
    const endY =
      answers.length > topN
        ? [...endProbs.slice(0, topN), sum(endProbs.slice(topN))]
        : endProbs
    return buildArray(isMultipleChoice && { x: start, y: startY }, betPoints, {
      x: end ?? Date.now() + DAY_MS,
      y: endY,
    })
  }, [answers.length, topN, betPoints, endProbs, start, end, isMultipleChoice])

  const rightmostDate = getRightmostVisibleDate(
    end,
    last(betPoints)?.x,
    Date.now()
  )
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
      const color = CHOICE_ALL_COLORS[index] ?? CHOICE_OTHER_COLOR
      const value = formatPct(prev.y[index])

      return (
        <>
          <span className="font-semibold">
            {formatDateInRange(d, start, end)}
          </span>
          <div className="flex max-w-xs flex-row justify-between gap-4">
            <Row className="items-center gap-2 overflow-hidden">
              <span
                className="h-4 w-4 shrink-0 rounded-sm"
                style={{ backgroundColor: color }}
              />
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
      colors={CHOICE_ALL_COLORS}
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
