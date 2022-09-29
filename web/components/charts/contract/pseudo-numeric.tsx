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

const getScaleP = (min: number, max: number, isLogScale: boolean) => {
  return (p: number) =>
    isLogScale
      ? 10 ** (p * Math.log10(max - min + 1)) + min - 1
      : p * (max - min) + min
}

const getBetPoints = (bets: Bet[], scaleP: (p: number) => number) => {
  return sortBy(bets, (b) => b.createdTime).map(
    (b) => [new Date(b.createdTime), scaleP(b.probAfter)] as const
  )
}

export const PseudoNumericContractChart = (props: {
  contract: PseudoNumericContract
  bets: Bet[]
  height?: number
}) => {
  const { contract, bets } = props
  const { min, max, isLogScale } = contract
  const [startDate, endDate] = getDateRange(contract)
  const scaleP = useMemo(
    () => getScaleP(min, max, isLogScale),
    [min, max, isLogScale]
  )
  const startP = scaleP(getInitialProbability(contract))
  const endP = scaleP(getProbability(contract))
  const betPoints = useMemo(() => getBetPoints(bets, scaleP), [bets, scaleP])
  const data = useMemo(
    () => [
      [startDate, startP] as const,
      ...betPoints,
      [endDate ?? MAX_DATE, endP] as const,
    ],
    [betPoints, startDate, startP, endDate, endP]
  )
  const rightmostDate = getRightmostVisibleDate(
    endDate,
    last(betPoints)?.[0],
    new Date(Date.now())
  )
  const visibleRange = [startDate, rightmostDate]
  const isMobile = useIsMobile(800)
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef) ?? 0
  const height = props.height ?? (isMobile ? 150 : 250)
  const xScale = scaleTime(visibleRange, [0, width - MARGIN_X]).clamp(true)
  // clamp log scale to make sure zeroes go to the bottom
  const yScale = isLogScale
    ? scaleLog([Math.max(min, 1), max], [height - MARGIN_Y, 0]).clamp(true)
    : scaleLinear([min, max], [height - MARGIN_Y, 0])

  return (
    <div ref={containerRef}>
      {width > 0 && (
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
