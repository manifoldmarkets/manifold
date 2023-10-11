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
import { HistoryPoint, viewScale } from 'common/chart'
import { Row } from 'web/components/layout/row'

const CHOICE_ANSWER_COLORS = [
  '#99DDFF', // sky
  '#FFDD99', // sand
  '#FFAABB', // pink
  '#77AADD', // navy
  '#CD46EA', // 🍆
  '#F23542', // blood red
  '#FF8C00', // orange
  '#44BB99', // forest
  '#FFD700', // gold
  '#7EEE03', // chartreuse
  '#F76B40', // orange-red
  '#C195F0', // Grimace shake purple
  '#0C7AE1', // octarine??
  '#E3E369', // yellow
  '#3F9FFF',
  '#2ECC71',
  '#F1C40F', // dehydrated yellow
  '#E04AC0',
  '#CCB374', // drab tan
  '#96E047',
  '#FFA500',
  '#F0C0DE',
  '#FF69B4',
  '#F9C74F',
  '#F93028',
  '#F49F1C',
  '#DEADFE',
  '#EFD1CC',
  '#5EE7B7',
  '#F96969',
  '#A3DE83',
  '#FFD166',
  '#BAEBE4',
  '#FF85A1',
  '#45EDEA',
  '#FFBF69',
  '#AED0D6',
  '#FFA69E',
  '#DBD56E',
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
  viewScaleProps: viewScale
  controlledStart?: number
  showZoomer?: boolean
}) => {
  const {
    contract,
    multiPoints = {},
    width,
    height,
    viewScaleProps,
    controlledStart,
    showZoomer,
  } = props

  const [start, end] = getDateRange(contract)
  const rangeStart = controlledStart ?? start
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
  const xScale = scaleTime([rangeStart, rightmostDate], [0, width])
  const yScale = scaleLinear([0, 1], [height, 0])

  return (
    <MultiValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      viewScaleProps={viewScaleProps}
      showZoomer={showZoomer}
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
