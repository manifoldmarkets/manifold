import { useMemo } from 'react'
import { last, sum, sortBy, groupBy } from 'lodash'
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
import { Avatar } from 'web/components/avatar'

export const CATEGORY_COLORS = [
  '#7eb0d5',
  '#fd7f6f',
  '#b2e061',
  '#bd7ebe',
  '#ffb55a',
  '#ffee65',
  '#beb9db',
  '#fdcce5',
  '#8bd3c7',
  '#bddfb7',
  '#e2e3f3',
  '#fafafa',
  '#9fcdeb',
  '#d3d3d3',
  '#b1a296',
  '#e1bdb6',
  '#f2dbc0',
  '#fae5d3',
  '#c5e0ec',
  '#e0f0ff',
  '#ffddcd',
  '#fbd5e2',
  '#f2e7e5',
  '#ffe7ba',
  '#eed9c4',
  '#ea9999',
  '#f9cb9c',
  '#ffe599',
  '#b6d7a8',
  '#a2c4c9',
  '#9fc5e8',
  '#b4a7d6',
  '#d5a6bd',
  '#e06666',
  '#f6b26b',
  '#ffd966',
  '#93c47d',
  '#76a5af',
  '#6fa8dc',
  '#8e7cc3',
  '#c27ba0',
  '#cc0000',
  '#e69138',
  '#f1c232',
  '#6aa84f',
  '#45818e',
  '#3d85c6',
  '#674ea7',
  '#a64d79',
  '#990000',
  '#b45f06',
  '#bf9000',
]

const MARGIN = { top: 20, right: 10, bottom: 20, left: 40 }
const MARGIN_X = MARGIN.left + MARGIN.right
const MARGIN_Y = MARGIN.top + MARGIN.bottom

const getTrackedAnswers = (
  contract: FreeResponseContract | MultipleChoiceContract,
  topN: number
) => {
  const { answers, outcomeType, totalBets } = contract
  const validAnswers = answers.filter((answer) => {
    return (
      (answer.id !== '0' || outcomeType === 'MULTIPLE_CHOICE') &&
      totalBets[answer.id] > 0.000000001
    )
  })
  return sortBy(
    validAnswers,
    (answer) => -1 * getOutcomeProbability(contract, answer.id)
  ).slice(0, topN)
}

const getBetPoints = (answers: Answer[], bets: Bet[]) => {
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
    points.push({
      x: new Date(bet.createdTime),
      y: answers.map((a) => sharesByOutcome[a.id] ** 2 / sharesSquared),
      obj: bet,
    })
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

export function useChartAnswers(
  contract: FreeResponseContract | MultipleChoiceContract
) {
  return useMemo(
    () => getTrackedAnswers(contract, CATEGORY_COLORS.length),
    [contract]
  )
}

export const ChoiceContractChart = (props: {
  contract: FreeResponseContract | MultipleChoiceContract
  bets: Bet[]
  width: number
  height: number
  onMouseOver?: (p: MultiPoint<Bet> | undefined) => void
}) => {
  const { contract, bets, width, height, onMouseOver } = props
  const [start, end] = getDateRange(contract)
  const answers = useChartAnswers(contract)
  const betPoints = useMemo(() => getBetPoints(answers, bets), [answers, bets])
  const data = useMemo(
    () => [
      { x: new Date(start), y: answers.map((_) => 0) },
      ...betPoints,
      {
        x: new Date(end ?? Date.now() + DAY_MS),
        y: answers.map((a) => getOutcomeProbability(contract, a.id)),
      },
    ],
    [answers, contract, betPoints, start, end]
  )
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
      const { data, x, xScale } = props
      const [start, end] = xScale.domain()
      const d = xScale.invert(x)
      const legendItems = sortBy(
        data.y.map((p, i) => ({
          color: CATEGORY_COLORS[i],
          label: answers[i].text,
          value: formatPct(p),
          p,
        })),
        (item) => -item.p
      ).slice(0, 10)
      return (
        <>
          <Row className="items-center gap-2">
            {data.obj && (
              <Avatar size="xxs" avatarUrl={data.obj.userAvatarUrl} />
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
      colors={CATEGORY_COLORS}
      curve={curveStepAfter}
      onMouseOver={onMouseOver}
      Tooltip={ChoiceTooltip}
    />
  )
}
