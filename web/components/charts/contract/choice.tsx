import { useMemo, useRef } from 'react'
import { sum, sortBy, groupBy } from 'lodash'
import { scaleTime, scaleLinear, schemeCategory10 } from 'd3'

import { Bet } from 'common/bet'
import { FreeResponseContract, MultipleChoiceContract } from 'common/contract'
import { getOutcomeProbability } from 'common/calculate'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { MARGIN_X, MARGIN_Y, getDateRange } from '../helpers'
import { MultiPoint, MultiValueHistoryChart } from '../generic-charts'
import { useElementWidth } from 'web/hooks/use-element-width'

const getMultiChartData = (
  contract: FreeResponseContract | MultipleChoiceContract,
  bets: Bet[],
  topN: number
) => {
  const { answers, totalBets, outcomeType } = contract

  const sortedBets = sortBy(bets, (b) => b.createdTime)
  const betsByOutcome = groupBy(sortedBets, (bet) => bet.outcome)
  const validAnswers = answers.filter((answer) => {
    const maxProb = Math.max(
      ...betsByOutcome[answer.id].map((bet) => bet.probAfter)
    )
    return (
      (answer.id !== '0' || outcomeType === 'MULTIPLE_CHOICE') &&
      maxProb > 0.02 &&
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
    [new Date(contract.createdTime), trackedAnswers.map((_) => 0)],
    ...points,
    [
      new Date(Date.now()),
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
  const data = useMemo(
    () => getMultiChartData(contract, bets, 6),
    [contract, bets]
  )
  const isMobile = useIsMobile(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef) ?? 0
  const height = props.height ?? (isMobile ? 150 : 250)
  const xScale = scaleTime(getDateRange(contract), [0, width - MARGIN_X])
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
          colors={schemeCategory10}
          labels={data.labels}
          pct
        />
      )}
    </div>
  )
}
