import { useMemo, useRef } from 'react'
import { sortBy } from 'lodash'
import { scaleTime, scaleLog, scaleLinear } from 'd3'

import { Bet } from 'common/bet'
import { getInitialProbability, getProbability } from 'common/calculate'
import { PseudoNumericContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { MARGIN_X, MARGIN_Y, getDateRange } from '../helpers'
import { SingleValueHistoryChart } from '../generic-charts'
import { useElementWidth } from 'web/hooks/use-element-width'

const getChartData = (contract: PseudoNumericContract, bets: Bet[]) => {
  const { min, max } = contract
  const getY = (p: number) => p * (max - min) + min
  const sortedBets = sortBy(bets, (b) => b.createdTime)
  const startProb = getInitialProbability(contract)
  const endProb = getProbability(contract)
  return [
    [new Date(contract.createdTime), getY(startProb)] as const,
    ...sortedBets.map(
      (b) => [new Date(b.createdTime), getY(b.probAfter)] as const
    ),
    [new Date(Date.now()), getY(endProb)] as const,
  ]
}

export const PseudoNumericContractChart = (props: {
  contract: PseudoNumericContract
  bets: Bet[]
  height?: number
}) => {
  const { contract, bets } = props
  const data = useMemo(() => getChartData(contract, bets), [contract, bets])
  const isMobile = useIsMobile(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef) ?? 0
  const height = props.height ?? isMobile ? 150 : 250
  const scaleType = contract.isLogScale ? scaleLog : scaleLinear
  const xScale = scaleTime(getDateRange(contract), [0, width - MARGIN_X])
  const yScale = scaleType([contract.min, contract.max], [height - MARGIN_Y, 0])
  return (
    <div ref={containerRef}>
      {width && (
        <SingleValueHistoryChart
          w={width}
          h={height}
          xScale={xScale}
          yScale={yScale}
          data={data}
          color={NUMERIC_GRAPH_COLOR}
        />
      )}
    </div>
  )
}
