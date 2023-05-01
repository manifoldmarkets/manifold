import { useMemo } from 'react'
import { last, sortBy } from 'lodash'
import { scaleTime, scaleLog, scaleLinear } from 'd3-scale'
import { curveStepAfter } from 'd3-shape'

import { DAY_MS } from 'common/util/time'
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

const MARGIN = { top: 20, right: 40, bottom: 20, left: 10 }
const MARGIN_X = MARGIN.left + MARGIN.right
const MARGIN_Y = MARGIN.top + MARGIN.bottom

// mqp: note that we have an idiosyncratic version of 'log scale'
// contracts. the values are stored "linearly" and can include zero.
// as a result, we have to do some weird-looking stuff in this code

const getScaleP = (min: number, max: number, isLogScale: boolean) => {
  return (p: number) =>
    isLogScale
      ? 10 ** (p * Math.log10(max - min + 1)) + min - 1
      : p * (max - min) + min
}

const getBetPoints = (
  bets: HistoryPoint<Partial<Bet>>[],
  scaleP: (p: number) => number
) => {
  return sortBy(bets, (b) => b.x).map((pt) => ({
    x: pt.x,
    y: scaleP(pt.y),
    obj: pt.obj,
  }))
}

const PseudoNumericChartTooltip = (
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
      )}{' '}
      <span className="font-semibold">{formatDateInRange(d, start, end)}</span>
      <span className="text-ink-600">{formatLargeNumber(prev.y)}</span>
    </Row>
  )
}

export const PseudoNumericContractChart = (props: {
  contract: PseudoNumericContract
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
  const data = useMemo(
    () => [
      { x: start, y: startP },
      ...betPoints,
      { x: end ?? Date.now() + DAY_MS, y: endP },
    ],
    [betPoints, start, startP, end, endP]
  )
  const rightmostDate = getRightmostVisibleDate(
    end,
    last(betPoints)?.x,
    Date.now()
  )
  const visibleRange = [rangeStart, rightmostDate]
  const xScale = scaleTime(visibleRange, [0, width - MARGIN_X])
  // clamp log scale to make sure zeroes go to the bottom
  const yScale = isLogScale
    ? scaleLog([Math.max(min, 1), max], [height - MARGIN_Y, 0]).clamp(true)
    : scaleLinear([min, max], [height - MARGIN_Y, 0])
  return (
    <ControllableSingleValueHistoryChart
      w={width}
      h={height}
      margin={MARGIN}
      xScale={xScale}
      yScale={yScale}
      viewScaleProps={viewScaleProps}
      data={data}
      curve={curveStepAfter}
      onMouseOver={onMouseOver}
      Tooltip={PseudoNumericChartTooltip}
      color={color ?? NUMERIC_GRAPH_COLOR}
    />
  )
}
