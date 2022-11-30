import { useMemo } from 'react'
import { last, sortBy } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'
import { curveStepAfter } from 'd3-shape'

import { getProbability, getInitialProbability } from 'common/calculate'
import { BinaryContract } from 'common/contract'
import { DAY_MS } from 'common/util/time'
import {
  TooltipProps,
  getDateRange,
  getRightmostVisibleDate,
  formatDateInRange,
  formatPct,
} from '../helpers'
import { HistoryPoint, SingleValueHistoryChart } from '../generic-charts'
import { Row } from 'web/components/layout/row'
import { BetPoint } from 'web/pages/[username]/[contractSlug]'
import { Avatar } from 'web/components/widgets/avatar'

const MARGIN = { top: 20, right: 40, bottom: 20, left: 10 }
const MARGIN_X = MARGIN.left + MARGIN.right
const MARGIN_Y = MARGIN.top + MARGIN.bottom

const getBetPoints = (bets: BetPoint[]) => {
  return sortBy(bets, (b) => b.x).map((b) => ({
    x: new Date(b.x),
    y: b.y,
    obj: b,
  }))
}

const BinaryChartTooltip = (
  props: TooltipProps<Date, HistoryPoint<BetPoint>>
) => {
  const { prev, x, xScale } = props
  const [start, end] = xScale.domain()
  const d = xScale.invert(x)
  if (!prev) return null
  return (
    <Row className="items-center gap-2">
      {prev.obj?.bet?.userAvatarUrl && (
        <Avatar size="xs" avatarUrl={prev.obj.bet?.userAvatarUrl} />
      )}
      <span className="font-semibold">{formatDateInRange(d, start, end)}</span>
      <span className="text-gray-600">{formatPct(prev.y)}</span>
    </Row>
  )
}

export const BinaryContractChart = (props: {
  contract: BinaryContract
  betPoints: BetPoint[]
  width: number
  height: number
  color?: string
  onMouseOver?: (p: HistoryPoint<BetPoint> | undefined) => void
}) => {
  const { contract, width, height, onMouseOver, color } = props
  const [start, end] = getDateRange(contract)
  const startP = getInitialProbability(contract)
  const endP = getProbability(contract)
  const betPoints = useMemo(
    () => getBetPoints(props.betPoints),
    [props.betPoints]
  )
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
      margin={MARGIN}
      xScale={xScale}
      yScale={yScale}
      yKind="percent"
      data={data}
      color={color ?? '#11b981'}
      curve={curveStepAfter}
      onMouseOver={onMouseOver}
      Tooltip={BinaryChartTooltip}
    />
  )
}
