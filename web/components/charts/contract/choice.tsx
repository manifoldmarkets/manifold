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
  bets: Bet[]
) => {
  const { totalBets, outcomeType } = contract

  const sortedBets = sortBy(bets, (b) => b.createdTime)
  const betsByOutcome = groupBy(sortedBets, (bet) => bet.outcome)
  const outcomes = Object.keys(betsByOutcome).filter((outcome) => {
    const maxProb = Math.max(
      ...betsByOutcome[outcome].map((bet) => bet.probAfter)
    )
    return (
      (outcome !== '0' || outcomeType === 'MULTIPLE_CHOICE') &&
      maxProb > 0.02 &&
      totalBets[outcome] > 0.000000001
    )
  })

  const trackedOutcomes = sortBy(
    outcomes,
    (outcome) => -1 * getOutcomeProbability(contract, outcome)
  )
    .slice(0, 10)
    .reverse()

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
      trackedOutcomes.map(
        (outcome) => sharesByOutcome[outcome] ** 2 / sharesSquared
      ),
    ])
  }

  const allPoints: MultiPoint[] = [
    [new Date(contract.createdTime), trackedOutcomes.map((_) => 0)],
    ...points,
    [
      new Date(Date.now()),
      trackedOutcomes.map((outcome) =>
        getOutcomeProbability(contract, outcome)
      ),
    ],
  ]
  return { points: allPoints, labels: trackedOutcomes }
}

export const ChoiceContractChart = (props: {
  contract: FreeResponseContract | MultipleChoiceContract
  bets: Bet[]
  height?: number
}) => {
  const { contract, bets } = props
  const data = useMemo(
    () => getMultiChartData(contract, bets),
    [contract, bets]
  )
  const isMobile = useIsMobile(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef) ?? 0
  const height = props.height ?? isMobile ? 150 : 250
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
