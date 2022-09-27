import { useMemo, useRef } from 'react'
import { sum, sortBy, groupBy } from 'lodash'
import { scaleTime, scaleLinear } from 'd3'

import { Bet } from 'common/bet'
import { FreeResponseContract, MultipleChoiceContract } from 'common/contract'
import { getOutcomeProbability } from 'common/calculate'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { MARGIN_X, MARGIN_Y, getDateRange } from '../helpers'
import { MultiPoint, MultiValueHistoryChart } from '../generic-charts'
import { useElementWidth } from 'web/hooks/use-element-width'

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

const getMultiChartData = (
  contract: FreeResponseContract | MultipleChoiceContract,
  bets: Bet[],
  start: Date,
  end: Date,
  topN: number
) => {
  const { answers, totalBets, outcomeType } = contract

  const sortedBets = sortBy(bets, (b) => b.createdTime)
  const betsByOutcome = groupBy(sortedBets, (bet) => bet.outcome)
  const validAnswers = answers.filter((answer) => {
    return (
      (answer.id !== '0' || outcomeType === 'MULTIPLE_CHOICE') &&
      totalBets[answer.id] > 0.000000001
    )
  })

  const trackedAnswers = sortBy(
    validAnswers,
    (answer) => -1 * getOutcomeProbability(contract, answer.id)
  ).slice(0, topN)

  const points: MultiPoint[] = []

  const sharesByOutcome = Object.fromEntries(
    Object.keys(betsByOutcome).map((outcome) => [outcome, 0])
  )

  for (const bet of sortedBets) {
    const { outcome, shares } = bet
    sharesByOutcome[outcome] += shares

    const sharesSquared = sum(
      Object.values(sharesByOutcome).map((shares) => shares ** 2)
    )
    points.push([
      new Date(bet.createdTime),
      trackedAnswers.map(
        (answer) => sharesByOutcome[answer.id] ** 2 / sharesSquared
      ),
    ])
  }

  const allPoints: MultiPoint[] = [
    [start, trackedAnswers.map((_) => 0)],
    ...points,
    [
      end,
      trackedAnswers.map((answer) =>
        getOutcomeProbability(contract, answer.id)
      ),
    ],
  ]
  return {
    points: allPoints,
    labels: trackedAnswers.map((answer) => answer.text),
  }
}

export const ChoiceContractChart = (props: {
  contract: FreeResponseContract | MultipleChoiceContract
  bets: Bet[]
  height?: number
}) => {
  const { contract, bets } = props
  const [start, end] = useMemo(() => getDateRange(contract), [contract])
  const data = useMemo(
    () => getMultiChartData(contract, bets, start, end, CATEGORY_COLORS.length),
    [contract, bets, start, end]
  )
  const isMobile = useIsMobile(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef) ?? 0
  const height = props.height ?? (isMobile ? 150 : 250)
  const xScale = scaleTime([start, end], [0, width - MARGIN_X])
  const yScale = scaleLinear([0, 1], [height - MARGIN_Y, 0])
  return (
    <div ref={containerRef}>
      {width && (
        <MultiValueHistoryChart
          w={width}
          h={height}
          xScale={xScale}
          yScale={yScale}
          data={data.points}
          colors={CATEGORY_COLORS}
          labels={data.labels}
          pct
        />
      )}
    </div>
  )
}
