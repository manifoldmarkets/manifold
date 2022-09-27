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

// mqp: note that we have an idiosyncratic version of 'log scale'
// contracts. the values are stored "linearly" and can include zero.
// as a result, we have to do some weird-looking stuff in this code

const getChartData = (
  contract: PseudoNumericContract,
  bets: Bet[],
  start: Date,
  end: Date
) => {
  const { min, max, isLogScale } = contract
  const getY = (p: number) =>
    isLogScale
      ? 10 ** (p * Math.log10(contract.max - contract.min + 1)) +
        contract.min -
        1
      : p * (max - min) + min
  const sortedBets = sortBy(bets, (b) => b.createdTime)
  const startProb = getInitialProbability(contract)
  const endProb = getProbability(contract)
  return [
    [start, getY(startProb)] as const,
    ...sortedBets.map(
      (b) => [new Date(b.createdTime), getY(b.probAfter)] as const
    ),
    [end, getY(endProb)] as const,
  ]
}

export const PseudoNumericContractChart = (props: {
  contract: PseudoNumericContract
  bets: Bet[]
  height?: number
}) => {
  const { contract, bets } = props
  const [start, end] = useMemo(() => getDateRange(contract), [contract])
  const data = useMemo(
    () => getChartData(contract, bets, start, end),
    [contract, bets, start, end]
  )
  const isMobile = useIsMobile(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef) ?? 0
  const height = props.height ?? (isMobile ? 150 : 250)
  const xScale = scaleTime([start, end], [0, width - MARGIN_X])
  const yScale = contract.isLogScale
    ? scaleLog(
        [Math.max(contract.min, 1), contract.max],
        [height - MARGIN_Y, 0]
      ).clamp(true) // make sure zeroes go to the bottom
    : scaleLinear([contract.min, contract.max], [height - MARGIN_Y, 0])

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
