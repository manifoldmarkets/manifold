import { useMemo, useRef } from 'react'
import { last, sortBy } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'

import { Bet } from 'common/bet'
import { getProbability, getInitialProbability } from 'common/calculate'
import { BinaryContract } from 'common/contract'
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

const getBetPoints = (bets: Bet[]) => {
  return sortBy(bets, (b) => b.createdTime).map(
    (b) => [new Date(b.createdTime), b.probAfter] as const
  )
}

export const BinaryContractChart = (props: {
  contract: BinaryContract
  bets: Bet[]
  height?: number
}) => {
  const { contract, bets } = props
  const [startDate, endDate] = getDateRange(contract)
  const startP = getInitialProbability(contract)
  const endP = getProbability(contract)
  const betPoints = useMemo(() => getBetPoints(bets), [bets])
  const data = useMemo(
    () => [
      [startDate, startP] as const,
      ...betPoints,
      [endDate ?? MAX_DATE, endP] as const,
    ],
    [startDate, startP, endDate, endP, betPoints]
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
  const height = props.height ?? (isMobile ? 250 : 350)
  const xScale = scaleTime(visibleRange, [0, width - MARGIN_X]).clamp(true)
  const yScale = scaleLinear([0, 1], [height - MARGIN_Y, 0])
  return (
    <div ref={containerRef}>
      {width > 0 && (
        <SingleValueHistoryChart
          w={width}
          h={height}
          xScale={xScale}
          yScale={yScale}
          data={data}
          color="#11b981"
          pct
        />
      )}
    </div>
  )
}
