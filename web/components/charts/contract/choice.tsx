import { useMemo, useRef } from 'react'
import { last, sum, sortBy, groupBy } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'

import { Bet } from 'common/bet'
import { Answer } from 'common/answer'
import { FreeResponseContract, MultipleChoiceContract } from 'common/contract'
import { getOutcomeProbability } from 'common/calculate'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import {
  MARGIN_X,
  MARGIN_Y,
  MAX_DATE,
  getDateRange,
  getRightmostVisibleDate,
  formatPct,
  formatDateInRange,
} from '../helpers'
import {
  Legend,
  MultiPoint,
  MultiValueHistoryChart,
  MultiValueHistoryTooltipProps,
} from '../generic-charts'
import { useElementWidth } from 'web/hooks/use-element-width'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'

// thanks to https://observablehq.com/@jonhelfman/optimal-orders-for-choosing-categorical-colors
const CATEGORY_COLORS = [
  '#00b8dd',
  '#eecafe',
  '#874c62',
  '#6457ca',
  '#f773ba',
  '#9c6bbc',
  '#a87744',
  '#af8a04',
  '#bff9aa',
  '#f3d89d',
  '#c9a0f5',
  '#ff00e5',
  '#9dc6f7',
  '#824475',
  '#d973cc',
  '#bc6808',
  '#056e70',
  '#677932',
  '#00b287',
  '#c8ab6c',
  '#a2fb7a',
  '#f8db68',
  '#14675a',
  '#8288f4',
  '#fe1ca0',
  '#ad6aff',
  '#786306',
  '#9bfbaf',
  '#b00cf7',
  '#2f7ec5',
  '#4b998b',
  '#42fa0e',
  '#5b80a1',
  '#962d9d',
  '#3385ff',
  '#48c5ab',
  '#b2c873',
  '#4cf9a4',
  '#00ffff',
  '#3cca73',
  '#99ae17',
  '#7af5cf',
  '#52af45',
  '#fbb80f',
  '#29971b',
  '#187c9a',
  '#00d539',
  '#bbfa1a',
  '#61f55c',
  '#cabc03',
  '#ff9000',
  '#779100',
  '#bcfd6f',
  '#70a560',
]

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
      datum: bet,
    })
  }
  return points
}

export const ChoiceContractChart = (props: {
  contract: FreeResponseContract | MultipleChoiceContract
  bets: Bet[]
  height?: number
}) => {
  const { contract, bets } = props
  const [start, end] = getDateRange(contract)
  const answers = useMemo(
    () => getTrackedAnswers(contract, CATEGORY_COLORS.length),
    [contract]
  )
  const betPoints = useMemo(() => getBetPoints(answers, bets), [answers, bets])
  const data = useMemo(
    () => [
      { x: start, y: answers.map((_) => 0) },
      ...betPoints,
      {
        x: end ?? MAX_DATE,
        y: answers.map((a) => getOutcomeProbability(contract, a.id)),
      },
    ],
    [answers, contract, betPoints, start, end]
  )
  const rightmostDate = getRightmostVisibleDate(
    end,
    last(betPoints)?.x,
    new Date(Date.now())
  )
  const visibleRange = [start, rightmostDate]
  const isMobile = useIsMobile(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef) ?? 0
  const height = props.height ?? (isMobile ? 150 : 250)
  const xScale = scaleTime(visibleRange, [0, width - MARGIN_X]).clamp(true)
  const yScale = scaleLinear([0, 1], [height - MARGIN_Y, 0])

  const ChoiceTooltip = useMemo(
    () => (props: MultiValueHistoryTooltipProps<Bet>) => {
      const { x, y, xScale, datum } = props
      const [start, end] = xScale.domain()
      const legendItems = sortBy(
        y.map((p, i) => ({
          color: CATEGORY_COLORS[i],
          label: answers[i].text,
          value: formatPct(p),
          p,
        })),
        (item) => -item.p
      ).slice(0, 10)
      return (
        <div>
          <Row className="items-center gap-2">
            {datum && <Avatar size="xxs" avatarUrl={datum.userAvatarUrl} />}
            <span>{formatDateInRange(x, start, end)}</span>
          </Row>
          <Legend className="max-w-xs text-sm" items={legendItems} />
        </div>
      )
    },
    [answers]
  )

  return (
    <div ref={containerRef}>
      {width > 0 && (
        <MultiValueHistoryChart
          w={width}
          h={height}
          xScale={xScale}
          yScale={yScale}
          data={data}
          colors={CATEGORY_COLORS}
          labels={answers.map((answer) => answer.text)}
          Tooltip={ChoiceTooltip}
          pct
        />
      )}
    </div>
  )
}
