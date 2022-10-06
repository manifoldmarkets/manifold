import { useMemo } from 'react'
import { last, sortBy } from 'lodash'
import { scaleTime, scaleLog, scaleLinear } from 'd3-scale'
import { curveStepAfter } from 'd3-shape'

import { Bet } from 'common/bet'
import { DAY_MS } from 'common/util/time'
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
import { HistoryPoint, SingleValueHistoryChart } from '../generic-charts'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'

const MARGIN = { top: 20, right: 10, bottom: 20, left: 40 }
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

const getBetPoints = (bets: Bet[], scaleP: (p: number) => number) => {
  return sortBy(bets, (b) => b.createdTime).map((b) => ({
    x: new Date(b.createdTime),
    y: scaleP(b.probAfter),
    obj: b,
  }))
}

const PseudoNumericChartTooltip = (
  props: TooltipProps<Date, HistoryPoint<Bet>>
) => {
  const { data, x, xScale } = props
  const [start, end] = xScale.domain()
  const d = xScale.invert(x)
  return (
    <Row className="items-center gap-2">
      {data.obj && <Avatar size="xs" avatarUrl={data.obj.userAvatarUrl} />}
      <span className="font-semibold">{formatDateInRange(d, start, end)}</span>
      <span className="text-greyscale-6">{formatLargeNumber(data.y)}</span>
    </Row>
  )
}

export const PseudoNumericContractChart = (props: {
  contract: PseudoNumericContract
  bets: Bet[]
  width: number
  height: number
  onMouseOver?: (p: HistoryPoint<Bet> | undefined) => void
}) => {
  const { contract, bets, width, height, onMouseOver } = props
  const { min, max, isLogScale } = contract
  const [start, end] = getDateRange(contract)
  const scaleP = useMemo(
    () => getScaleP(min, max, isLogScale),
    [min, max, isLogScale]
  )
  const startP = scaleP(getInitialProbability(contract))
  const endP = scaleP(getProbability(contract))
  const betPoints = useMemo(() => getBetPoints(bets, scaleP), [bets, scaleP])
  const data = useMemo(
    () => [
      { x: new Date(start), y: startP },
      ...betPoints,
      { x: new Date(end ?? Date.now() + DAY_MS), y: endP },
    ],
    [betPoints, start, startP, end, endP]
  )
  const rightmostDate = getRightmostVisibleDate(
    end,
    last(betPoints)?.x?.getTime(),
    Date.now()
  )
  const visibleRange = [start, rightmostDate]
  const xScale = scaleTime(visibleRange, [0, width - MARGIN_X])
  // clamp log scale to make sure zeroes go to the bottom
  const yScale = isLogScale
    ? scaleLog([Math.max(min, 1), max], [height - MARGIN_Y, 0]).clamp(true)
    : scaleLinear([min, max], [height - MARGIN_Y, 0])
  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      margin={MARGIN}
      xScale={xScale}
      yScale={yScale}
      data={data}
      curve={curveStepAfter}
      onMouseOver={onMouseOver}
      Tooltip={PseudoNumericChartTooltip}
      color={NUMERIC_GRAPH_COLOR}
    />
  )
}
