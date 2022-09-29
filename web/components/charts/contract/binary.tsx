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
  formatDateInRange,
  formatPct,
} from '../helpers'
import {
  SingleValueHistoryTooltipProps,
  SingleValueHistoryChart,
} from '../generic-charts'
import { useElementWidth } from 'web/hooks/use-element-width'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'

const getBetPoints = (bets: Bet[]) => {
  return sortBy(bets, (b) => b.createdTime).map((b) => ({
    x: new Date(b.createdTime),
    y: b.probAfter,
    datum: b,
  }))
}

const BinaryChartTooltip = (props: SingleValueHistoryTooltipProps<Bet>) => {
  const { p, xScale } = props
  const { x, y, datum } = p
  const [start, end] = xScale.domain()
  return (
    <Row className="items-center gap-2 text-sm">
      {datum && <Avatar size="xs" avatarUrl={datum.userAvatarUrl} />}
      <strong>{formatPct(y)}</strong>
      <span>{formatDateInRange(x, start, end)}</span>
    </Row>
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
      { x: startDate, y: startP },
      ...betPoints,
      { x: endDate ?? MAX_DATE, y: endP },
    ],
    [startDate, startP, endDate, endP, betPoints]
  )

  const rightmostDate = getRightmostVisibleDate(
    endDate,
    last(betPoints)?.x,
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
          Tooltip={BinaryChartTooltip}
          pct
        />
      )}
    </div>
  )
}
