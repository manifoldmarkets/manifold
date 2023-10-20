import { useMemo } from 'react'
import { cloneDeep, groupBy, last, mapValues, sortBy } from 'lodash'
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
import { pick } from 'lodash'
import { buildArray } from 'common/util/array'

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

export const CHOICE_OTHER_COLOR = '#C2C3DB'

export const nthColor = (index: number) =>
  CHOICE_ANSWER_COLORS[index % CHOICE_ANSWER_COLORS.length]

export function getAnswerColor(
  answer: Answer | DpmAnswer,
  answerIdOrder: string[]
) {
  const index =
    'index' in answer ? answer.index : answerIdOrder.indexOf(answer.text)

  return 'isOther' in answer && answer.isOther
    ? CHOICE_OTHER_COLOR
    : nthColor(index)
}

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
  highlightAnswerId?: string
  checkedAnswerIds?: string[]
}) => {
  const {
    contract,
    multiPoints = {},
    width,
    height,
    viewScaleProps,
    controlledStart,
    showZoomer,
    highlightAnswerId,
    checkedAnswerIds,
  } = props

  const [start, end] = getDateRange(contract)
  const rangeStart = controlledStart ?? start
  const answers = useChartAnswers(contract)

  const now = useMemo(() => Date.now(), [multiPoints])

  const data = useMemo(() => {
    if (!answers.length) return {}

    const firstAnswerTime = answers[0].createdTime
    const startAnswers = answers.filter(
      (a) => a.createdTime <= firstAnswerTime + 1000
    )

    const pointsById = cloneDeep(multiPoints)

    const startP = 1 / startAnswers.length
    startAnswers.forEach((a) =>
      (pointsById[a.id] ?? []).unshift({ x: start, y: startP })
    )

    answers.forEach((a) => {
      if (!pointsById[a.id]) pointsById[a.id] = []
      pointsById[a.id].push({
        x: end ?? now,
        y: getAnswerProbability(contract, a.id),
      })
    })

    const entries = answers.map(
      (a) =>
        [
          a.id,
          {
            points: pointsById[a.id],
            color: getAnswerColor(
              a,
              answers.map((a) => a.text)
            ),
          },
        ] as const
    )
    return Object.fromEntries(entries)
  }, [answers.length, multiPoints, start, end, now])

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
      data={
        checkedAnswerIds?.length
          ? pick(data, buildArray(checkedAnswerIds, highlightAnswerId))
          : data
      }
      hoveringId={highlightAnswerId}
      Tooltip={(props) => (
        <ChoiceTooltip answers={answers} xScale={xScale} ttProps={props} />
      )}
    />
  )
}

const ChoiceTooltip = (props: {
  ttProps: TooltipProps<HistoryPoint> & { ans: string }
  xScale: any
  answers: (DpmAnswer | Answer)[]
}) => {
  const { ttProps, xScale, answers } = props
  const { prev, next, x, ans } = ttProps

  if (!prev) return null

  const [start, end] = xScale.domain()

  const d = xScale.invert(x)

  const answer = answers.find((a) => a.id === ans)?.text ?? 'Other'
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
