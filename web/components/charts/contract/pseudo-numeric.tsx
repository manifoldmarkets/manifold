import { useMemo } from 'react'
import { last } from 'lodash'
import { scaleTime, scaleLog, scaleLinear } from 'd3-scale'
import { Bet } from 'common/bet'
import { getInitialProbability, getProbability } from 'common/calculate'
import { formatLargeNumber } from 'common/util/format'
import { PseudoNumericContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import {
  TooltipProps,
  getDateRange,
  getRightmostVisibleDate,
  formatDateInRange,
} from '../helpers'
import { ControllableSingleValueHistoryChart } from '../generic-charts'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { HistoryPoint, viewScale } from 'common/chart'
import { HOUR_MS } from 'common/util/time'

// mqp: note that we have an idiosyncratic version of 'log scale'
// contracts. the values are stored "linearly" and can include zero.
// as a result, we have to do some weird-looking stuff in this code

const getScaleP = (min: number, max: number, isLogScale: boolean) => {
  return (p: number) =>
    isLogScale
      ? 10 ** (p * Math.log10(max - min + 1)) + min - 1
      : p * (max - min) + min
}

// same as BinaryPoint
type NumericPoint = HistoryPoint<{
  userAvatarUrl?: string
  isLast?: boolean
}>

const getBetPoints = (bets: NumericPoint[], scaleP: (p: number) => number) => {
  return bets.map((pt) => ({ x: pt.x, y: scaleP(pt.y), obj: pt.obj }))
}

const PseudoNumericChartTooltip = (props: TooltipProps<Date, NumericPoint>) => {
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
      <span className="text-ink-600">{formatLargeNumber(prev.y)}</span>
    </Row>
  )
}

export const PseudoNumericContractChart = (props: {
  contract: PseudoNumericContract
  betPoints: NumericPoint[]
  width: number
  height: number
  viewScaleProps: viewScale
  showZoomer?: boolean
  controlledStart?: number
  color?: string
  onMouseOver?: (p: NumericPoint | undefined) => void
}) => {
  const {
    contract,
    width,
    height,
    viewScaleProps,
    showZoomer,
    controlledStart,
    color,
    onMouseOver,
  } = props
  const { min, max, isLogScale } = contract
  const [start, end] = getDateRange(contract)
  const rangeStart = controlledStart ?? start
  const scaleP = useMemo(
    () => getScaleP(min, max, isLogScale),
    [min, max, isLogScale]
  )
  const startP = scaleP(getInitialProbability(contract))
  const endP = scaleP(getProbability(contract))
  const betPoints = useMemo(
    () => getBetPoints(props.betPoints, scaleP),
    [props.betPoints, scaleP]
  )

  const now = useMemo(() => Date.now() + 2 * HOUR_MS, [betPoints])

  const data = useMemo(
    () => [
      { x: start, y: startP },
      ...betPoints,
      { x: end ?? now, y: endP, obj: { isLast: true } },
    ],
    [betPoints, start, startP, end, endP]
  )
  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)
  const xScale = scaleTime([rangeStart, rightmostDate], [0, width])
  // clamp log scale to make sure zeroes go to the bottom
  const yScale = isLogScale
    ? scaleLog([Math.max(min, 1), max], [height, 0]).clamp(true)
    : scaleLinear([min, max], [height, 0])
  return (
    <ControllableSingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      viewScaleProps={viewScaleProps}
      showZoomer={showZoomer}
      data={data}
      onMouseOver={onMouseOver}
      Tooltip={PseudoNumericChartTooltip}
      color={color ?? NUMERIC_GRAPH_COLOR}
    />
  )
}
