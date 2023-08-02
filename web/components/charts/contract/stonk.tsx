import { useMemo } from 'react'
import { last, maxBy, minBy } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'
import { curveStepAfter } from 'd3-shape'
import { Bet } from 'common/bet'
import { getInitialProbability, getProbability } from 'common/calculate'
import { formatLargeNumber } from 'common/util/format'
import { StonkContract } from 'common/contract'
import {
  TooltipProps,
  getDateRange,
  getRightmostVisibleDate,
  formatDateInRange,
} from '../helpers'
import { ControllableSingleValueHistoryChart } from '../generic-charts'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { getStonkPriceAtProb } from 'common/stonk'
import { YES_GRAPH_COLOR } from 'common/envs/constants'
import { HistoryPoint, viewScale } from 'common/chart'

const getScaleP = () => {
  return (p: number) => getStonkPriceAtProb({} as StonkContract, p)
}

const getBetPoints = (
  bets: HistoryPoint<Partial<Bet>>[],
  scaleP: (p: number) => number
) => {
  return bets.map((pt) => ({ x: pt.x, y: scaleP(pt.y), obj: pt.obj }))
}

const StonkChartTooltip = (
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

export const StonkContractChart = (props: {
  contract: StonkContract
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

  const [start, end] = getDateRange(contract)
  const rangeStart = controlledStart ?? start
  const betPointsInRange = useMemo(
    () => props.betPoints.filter((pt) => pt.x >= rangeStart),
    [props.betPoints, rangeStart]
  )
  const minProb = useMemo(
    () => minBy(betPointsInRange, (pt) => pt.y)?.y ?? 0.0001,
    [betPointsInRange]
  )
  const maxProb = useMemo(
    () => maxBy(betPointsInRange, (pt) => pt.y)?.y ?? 0.9999,
    [betPointsInRange]
  )
  const min = getStonkPriceAtProb(contract, minProb)
  const max = getStonkPriceAtProb(contract, maxProb)
  const scaleP = useMemo(getScaleP, [])
  const startP = scaleP(getInitialProbability(contract))
  const endP = scaleP(getProbability(contract))
  const betPoints = useMemo(
    () => getBetPoints(props.betPoints, scaleP),
    [props.betPoints, scaleP]
  )

  const now = useMemo(Date.now, [])

  const data = useMemo(
    () => [{ x: start, y: startP }, ...betPoints, { x: end ?? now, y: endP }],
    [betPoints, start, startP, end, endP]
  )
  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)
  const xScale = scaleTime([rangeStart, rightmostDate], [0, width])
  // clamp log scale to make sure zeroes go to the bottom
  const yScale = scaleLinear([min, max], [height, 0])
  return (
    <ControllableSingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      viewScaleProps={viewScaleProps}
      data={data}
      curve={curveStepAfter}
      onMouseOver={onMouseOver}
      Tooltip={StonkChartTooltip}
      color={color ?? YES_GRAPH_COLOR}
    />
  )
}
