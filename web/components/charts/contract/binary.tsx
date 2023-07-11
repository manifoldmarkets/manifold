import { useMemo } from 'react'
import { last } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'
import { curveStepAfter } from 'd3-shape'

import { Bet } from 'common/bet'
import { getProbability } from 'common/calculate'
import { BinaryContract } from 'common/contract'
import {
  TooltipProps,
  getDateRange,
  getRightmostVisibleDate,
  formatDateInRange,
  formatPct,
} from '../helpers'
import { ControllableSingleValueHistoryChart } from '../generic-charts'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { YES_GRAPH_COLOR } from 'common/envs/constants'
import { HistoryPoint, viewScale } from 'common/chart'

const BinaryChartTooltip = (
  props: TooltipProps<Date, HistoryPoint<Partial<Bet>>>
) => {
  const { prev, x, xScale } = props
  const [start, end] = xScale.domain()
  const d = xScale.invert(x)
  if (!prev) return null
  return (
    <Row className="items-center gap-2">
      {prev.obj?.userAvatarUrl && (
        <Avatar size="xs" avatarUrl={prev.obj.userAvatarUrl} />
      )}
      <span className="font-semibold">{formatDateInRange(d, start, end)}</span>
      <span className="text-ink-600">{formatPct(prev.y)}</span>
    </Row>
  )
}

export const BinaryContractChart = (props: {
  contract: BinaryContract
  betPoints: HistoryPoint<Partial<Bet>>[]
  width: number
  height: number
  viewScaleProps: viewScale
  controlledStart?: number
  color?: string
  onMouseOver?: (p: HistoryPoint<Partial<Bet>> | undefined) => void
}) => {
  const {
    contract,
    width,
    height,
    viewScaleProps,
    controlledStart,
    onMouseOver,
    color,
    betPoints,
  } = props
  const [start, end] = getDateRange(contract)
  const rangeStart = controlledStart ?? start
  const endP = getProbability(contract)

  const now = useMemo(Date.now, [betPoints])

  const data = useMemo(() => {
    return [...betPoints, { x: end ?? now, y: endP }]
  }, [end, endP, betPoints])

  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)

  const visibleRange = [rangeStart, rightmostDate]
  const xScale = scaleTime(visibleRange, [0, width])
  const yScale = scaleLinear([0, 1], [height, 0])
  return (
    <ControllableSingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      viewScaleProps={viewScaleProps}
      yKind="percent"
      data={data}
      color={color ?? YES_GRAPH_COLOR}
      curve={curveStepAfter}
      onMouseOver={onMouseOver}
      Tooltip={BinaryChartTooltip}
    />
  )
}
