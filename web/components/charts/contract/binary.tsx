import { useMemo } from 'react'
import { last, sortBy } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'

import { Bet } from 'common/bet'
import { getProbability, getInitialProbability } from 'common/calculate'
import { BinaryContract } from 'common/contract'
import { DAY_MS } from 'common/util/time'
import {
  TooltipProps,
  MARGIN_X,
  MARGIN_Y,
  getDateRange,
  getRightmostVisibleDate,
  formatDateInRange,
  formatPct,
} from '../helpers'
import { HistoryPoint, SingleValueHistoryChart } from '../generic-charts'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'

const getBetPoints = (bets: Bet[]) => {
  return sortBy(bets, (b) => b.createdTime).map((b) => ({
    x: new Date(b.createdTime),
    y: b.probAfter,
    obj: b,
  }))
}

const BinaryChartTooltip = (props: TooltipProps<Date, HistoryPoint<Bet>>) => {
  const { data, mouseX, xScale } = props
  const [start, end] = xScale.domain()
  const d = xScale.invert(mouseX)
  return (
    <Row className="items-center gap-2">
      {data.obj && <Avatar size="xs" avatarUrl={data.obj.userAvatarUrl} />}
      <span className="font-semibold">{formatDateInRange(d, start, end)}</span>
      <span className="text-greyscale-6">{formatPct(data.y)}</span>
    </Row>
  )
}

export const BinaryContractChart = (props: {
  contract: BinaryContract
  bets: Bet[]
  width: number
  height: number
  onMouseOver?: (p: HistoryPoint<Bet> | undefined) => void
}) => {
  const { contract, bets, width, height, onMouseOver } = props
  const [start, end] = getDateRange(contract)
  const startP = getInitialProbability(contract)
  const endP = getProbability(contract)
  const betPoints = useMemo(() => getBetPoints(bets), [bets])
  const data = useMemo(() => {
    return [
      { x: new Date(start), y: startP },
      ...betPoints,
      { x: new Date(end ?? Date.now() + DAY_MS), y: endP },
    ]
  }, [start, startP, end, endP, betPoints])

  const rightmostDate = getRightmostVisibleDate(
    end,
    last(betPoints)?.x?.getTime(),
    Date.now()
  )
  const visibleRange = [start, rightmostDate]
  const xScale = scaleTime(visibleRange, [0, width - MARGIN_X])
  const yScale = scaleLinear([0, 1], [height - MARGIN_Y, 0])
  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      data={data}
      color="#11b981"
      onMouseOver={onMouseOver}
      Tooltip={BinaryChartTooltip}
      pct
    />
  )
}
