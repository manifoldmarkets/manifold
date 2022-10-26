import { useMemo } from 'react'
import { last, range, sum, sortBy, groupBy } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'
import { curveStepAfter } from 'd3-shape'

import { Bet } from 'common/bet'
import { Answer } from 'common/answer'
import { FreeResponseContract, MultipleChoiceContract } from 'common/contract'
import { getOutcomeProbability } from 'common/calculate'
import { DAY_MS } from 'common/util/time'
import {
  TooltipProps,
  getDateRange,
  getRightmostVisibleDate,
  formatPct,
  formatDateInRange,
} from '../helpers'
import { MultiPoint, MultiValueHistoryChart } from '../generic-charts'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'

type ChoiceContract = FreeResponseContract | MultipleChoiceContract

export const CHOICE_ANSWER_COLORS = [
  '#97C1EB',
  '#F39F83',
  '#F9EBA5',
  '#FFC7D2',
  '#C7ECFF',
  '#8CDEC7',
  '#DBE96F',
]
export const CHOICE_OTHER_COLOR = '#CCC'
export const CHOICE_ALL_COLORS = [...CHOICE_ANSWER_COLORS, CHOICE_OTHER_COLOR]

const MARGIN = { top: 20, right: 10, bottom: 20, left: 40 }
const MARGIN_X = MARGIN.left + MARGIN.right
const MARGIN_Y = MARGIN.top + MARGIN.bottom

const getAnswers = (contract: ChoiceContract) => {
  const { answers, outcomeType } = contract
  const validAnswers = answers.filter(
    (answer) => answer.id !== '0' || outcomeType === 'MULTIPLE_CHOICE'
  )
  return sortBy(
    validAnswers,
    (answer) => -1 * getOutcomeProbability(contract, answer.id)
  )
}

const getBetPoints = (answers: Answer[], bets: Bet[], topN?: number) => {
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
      points.push({ x: new Date(bet.createdTime), y, obj: bet })
    } else {
      points.push({ x: new Date(bet.createdTime), y: probs, obj: bet })
    }
  }
  return points
}

type LegendItem = { color: string; label: string; value?: string }
const Legend = (props: { className?: string; items: LegendItem[] }) => {
  const { items, className } = props
  return (
    <ol className={className}>
      {items.map((item) => (
        <li key={item.label} className="flex flex-row justify-between gap-4">
          <Row className="items-center gap-2 overflow-hidden">
            <span
              className="h-4 w-4 shrink-0"
              style={{ backgroundColor: item.color }}
            ></span>
            <span className="text-semibold overflow-hidden text-ellipsis">
              {item.label}
            </span>
          </Row>
          <span className="text-greyscale-6">{item.value}</span>
        </li>
      ))}
    </ol>
  )
}

export function useChartAnswers(contract: ChoiceContract) {
  return useMemo(() => getAnswers(contract), [contract])
}

export const ChoiceContractChart = (props: {
  contract: ChoiceContract
  bets: Bet[]
  width: number
  height: number
  onMouseOver?: (p: MultiPoint<Bet> | undefined) => void
}) => {
  const { contract, bets, width, height, onMouseOver } = props
  const [start, end] = getDateRange(contract)
  const answers = useChartAnswers(contract)
  const topN = Math.min(CHOICE_ANSWER_COLORS.length, answers.length)
  const betPoints = useMemo(
    () => getBetPoints(answers, bets, topN),
    [answers, bets, topN]
  )
  const endProbs = useMemo(
    () => answers.map((a) => getOutcomeProbability(contract, a.id)),
    [answers, contract]
  )

  const data = useMemo(() => {
    const yCount = answers.length > topN ? topN + 1 : topN
    const startY = range(0, yCount).map((_) => 0)
    const endY =
      answers.length > topN
        ? [...endProbs.slice(0, topN), sum(endProbs.slice(topN))]
        : endProbs
    return [
      { x: new Date(start), y: startY },
      ...betPoints,
      {
        x: new Date(end ?? Date.now() + DAY_MS),
        y: endY,
      },
    ]
  }, [answers.length, topN, betPoints, endProbs, start, end])

  const rightmostDate = getRightmostVisibleDate(
    end,
    last(betPoints)?.x?.getTime(),
    Date.now()
  )
  const visibleRange = [start, rightmostDate]
  const xScale = scaleTime(visibleRange, [0, width - MARGIN_X])
  const yScale = scaleLinear([0, 1], [height - MARGIN_Y, 0])

  const ChoiceTooltip = useMemo(
    () => (props: TooltipProps<Date, MultiPoint<Bet>>) => {
      const { prev, x, xScale } = props
      const [start, end] = xScale.domain()
      const d = xScale.invert(x)
      if (!prev) return null
      const legendItems = sortBy(
        prev.y.map((p, i) => ({
          color: CHOICE_ALL_COLORS[i],
          label: i === CHOICE_ANSWER_COLORS.length ? 'Other' : answers[i].text,
          value: formatPct(p),
          p,
        })),
        (item) => -item.p
      ).slice(0, 10)
      return (
        <>
          <Row className="items-center gap-2">
            {prev.obj && (
              <Avatar size="xxs" avatarUrl={prev.obj.userAvatarUrl} />
            )}
            <span className="text-semibold text-base">
              {formatDateInRange(d, start, end)}
            </span>
          </Row>
          <Legend className="max-w-xs" items={legendItems} />
        </>
      )
    },
    [answers]
  )

  return (
    <MultiValueHistoryChart
      w={width}
      h={height}
      margin={MARGIN}
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
