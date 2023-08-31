import { useMemo } from 'react'
import { last } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'

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
import { HOUR_MS } from 'common/util/time'

type BinaryPoint = HistoryPoint<{
  userAvatarUrl?: string
  isLast?: boolean
}>

const BinaryChartTooltip = (props: TooltipProps<Date, BinaryPoint>) => {
  const { prev, next, x, xScale } = props
  if (!prev) return null

  const [start, end] = xScale.domain()
  const d = xScale.invert(x)
  const dateLabel =
    !next || next.obj?.isLast ? 'Now' : formatDateInRange(d, start, end)

  return (
    <Row className="items-center gap-2">
      {prev.obj?.userAvatarUrl && (
        <Avatar size="xs" avatarUrl={prev.obj.userAvatarUrl} />
      )}
      <span className="font-semibold">{dateLabel}</span>
      <span className="text-ink-600">{formatPct(prev.y)}</span>
    </Row>
  )
}

export const BinaryContractChart = (props: {
  contract: BinaryContract
  betPoints: BinaryPoint[]
  width: number
  height: number
  viewScaleProps: viewScale
  controlledStart?: number
  percentBounds?: { max?: number; min?: number }
  color?: string
  onMouseOver?: (p: BinaryPoint | undefined) => void
  showZoomer?: boolean
}) => {
  const {
    contract,
    width,
    height,
    viewScaleProps,
    controlledStart,
    percentBounds,
    onMouseOver,
    color,
    betPoints,
    showZoomer,
  } = props
  const [start, end] = getDateRange(contract)
  const rangeStart = controlledStart ?? start
  const endP = getProbability(contract)

  const now = useMemo(() => Date.now() + 2 * HOUR_MS, [betPoints])

  const data = useMemo(() => {
    return [...betPoints, { x: end ?? now, y: endP, obj: { isLast: true } }]
  }, [end, endP, betPoints])

  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)

  const xScale = scaleTime([rangeStart, rightmostDate], [0, width])
  const yScale = scaleLinear(
    [percentBounds?.min ?? 0, percentBounds?.max ?? 1],
    [height, 0]
  )
  return (
    <ControllableSingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      viewScaleProps={viewScaleProps}
      showZoomer={showZoomer}
      yKind="percent"
      data={data}
      color={color ?? YES_GRAPH_COLOR}
      onMouseOver={onMouseOver}
      Tooltip={BinaryChartTooltip}
    />
  )
}
