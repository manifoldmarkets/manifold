import { useMemo, useRef } from 'react'
import { last, sortBy } from 'lodash'
import { scaleTime, scaleLog, scaleLinear } from 'd3-scale'

import { Bet } from 'common/bet'
import { getInitialProbability, getProbability } from 'common/calculate'
import { PseudoNumericContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import {
  MARGIN_X,
  MARGIN_Y,
  MAX_DATE,
  getDateRange,
  getRightmostVisibleDate,
} from '../helpers'
import { SingleValueHistoryChart } from '../generic-charts'
import { useElementWidth } from 'web/hooks/use-element-width'

// mqp: note that we have an idiosyncratic version of 'log scale'
// contracts. the values are stored "linearly" and can include zero.
// as a result, we have to do some weird-looking stuff in this code

const getY = (p: number, contract: PseudoNumericContract) => {
  const { min, max, isLogScale } = contract
  return isLogScale
    ? 10 ** (p * Math.log10(max - min + 1)) + min - 1
    : p * (max - min) + min
}

const getBetPoints = (contract: PseudoNumericContract, bets: Bet[]) => {
  return sortBy(bets, (b) => b.createdTime).map(
    (b) => [new Date(b.createdTime), getY(b.probAfter, contract)] as const
  )
}

const getStartPoint = (contract: PseudoNumericContract, start: Date) => {
  return [start, getY(getInitialProbability(contract), contract)] as const
}

const getEndPoint = (contract: PseudoNumericContract, end: Date) => {
  return [end, getY(getProbability(contract), contract)] as const
}

export const PseudoNumericContractChart = (props: {
  contract: PseudoNumericContract
  bets: Bet[]
  height?: number
}) => {
  const { contract, bets } = props
  const [contractStart, contractEnd] = getDateRange(contract)
  const betPoints = useMemo(
    () => getBetPoints(contract, bets),
    [contract, bets]
  )
  const data = useMemo(
    () => [
      getStartPoint(contract, contractStart),
      ...betPoints,
      getEndPoint(contract, contractEnd ?? MAX_DATE),
    ],
    [contract, betPoints, contractStart, contractEnd]
  )
  const rightmostDate = getRightmostVisibleDate(
    contractEnd,
    last(betPoints)?.[0],
    new Date(Date.now())
  )
  const visibleRange = [contractStart, rightmostDate]
  const isMobile = useIsMobile(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef) ?? 0
  const height = props.height ?? (isMobile ? 150 : 250)
  const xScale = scaleTime(visibleRange, [0, width - MARGIN_X]).clamp(true)
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
