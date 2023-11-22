import { useMemo } from 'react'
import { last, maxBy, minBy } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'
import { Bet } from 'common/bet'
import { getInitialProbability, getProbability } from 'common/calculate'
import { formatLargeNumber } from 'common/util/format'
import { StonkContract } from 'common/contract'
import {
  TooltipProps,
  getEndDate,
  getRightmostVisibleDate,
  formatDate,
  ZoomParams,
} from '../helpers'
import { SingleValueHistoryChart } from '../generic-charts'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { getStonkPriceAtProb } from 'common/stonk'
import { YES_GRAPH_COLOR } from 'common/envs/constants'
import { HistoryPoint } from 'common/chart'

const getScaleP = () => {
  return (p: number) => getStonkPriceAtProb({} as StonkContract, p)
}

const getBetPoints = (
  bets: HistoryPoint<Partial<Bet>>[],
  scaleP: (p: number) => number
) => {
  return bets.map((pt) => ({ x: pt.x, y: scaleP(pt.y), obj: pt.obj }))
}

const StonkChartTooltip = (props: TooltipProps<HistoryPoint<Partial<Bet>>>) => {
  const { prev } = props
  if (!prev) return null
  return (
    <Row className="items-center gap-2">
      {prev.obj?.userAvatarUrl && (
        <Avatar size="xs" avatarUrl={prev.obj.userAvatarUrl} />
      )}{' '}
      <span className="font-semibold">{formatDate(prev.x)}</span>
      <span className="text-ink-600">{formatLargeNumber(prev.y)}</span>
    </Row>
  )
}

export const StonkContractChart = (props: {
  contract: StonkContract
  betPoints: HistoryPoint<Partial<Bet>>[]
  width: number
  height: number
  zoomParams?: ZoomParams
  showZoomer?: boolean
  color?: string
}) => {
  const { contract, width, height, zoomParams, showZoomer, color } = props

  const start = contract.createdTime
  const end = getEndDate(contract)
  const betPointsInRange = useMemo(
    () => props.betPoints.filter((pt) => pt.x >= start),
    [props.betPoints, start]
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
  const xScale = scaleTime([start, rightmostDate], [0, width])
  // clamp log scale to make sure zeroes go to the bottom
  const yScale = scaleLinear([min, max], [height, 0])
  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      zoomParams={zoomParams}
      showZoomer={showZoomer}
      data={data}
      Tooltip={StonkChartTooltip}
      color={color ?? YES_GRAPH_COLOR}
    />
  )
}
