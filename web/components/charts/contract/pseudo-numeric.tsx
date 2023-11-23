import { useMemo } from 'react'
import { last } from 'lodash'
import { scaleTime, scaleLog, scaleLinear } from 'd3-scale'
import { getInitialProbability, getProbability } from 'common/calculate'
import { formatLargeNumber } from 'common/util/format'
import { PseudoNumericContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import {
  TooltipProps,
  getEndDate,
  getRightmostVisibleDate,
  formatDateInRange,
  ZoomParams,
} from '../helpers'
import { SingleValueHistoryChart } from '../generic-charts'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { HistoryPoint } from 'common/chart'

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
type NumericPoint = HistoryPoint<{ userAvatarUrl?: string }>

const getBetPoints = (bets: NumericPoint[], scaleP: (p: number) => number) => {
  return bets.map((pt) => ({ x: pt.x, y: scaleP(pt.y), obj: pt.obj }))
}

const PseudoNumericChartTooltip = (
  props: TooltipProps<NumericPoint> & { dateLabel: string }
) => {
  const { prev, next, dateLabel } = props
  if (!prev) return null

  return (
    <Row className="items-center gap-2">
      {prev.obj?.userAvatarUrl && (
        <Avatar size="xs" avatarUrl={prev.obj.userAvatarUrl} />
      )}
      <span className="font-semibold">{next ? dateLabel : 'Now'}</span>
      <span className="text-ink-600">{formatLargeNumber(prev.y)}</span>
    </Row>
  )
}

export const PseudoNumericContractChart = (props: {
  contract: PseudoNumericContract
  betPoints: NumericPoint[]
  width: number
  height: number
  zoomParams?: ZoomParams
  showZoomer?: boolean
}) => {
  const { contract, width, height, zoomParams, showZoomer } = props
  const { min, max, isLogScale } = contract
  const start = contract.createdTime
  const end = getEndDate(contract)
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

  const now = useMemo(() => Date.now(), [betPoints])

  const data = useMemo(
    () => [{ x: start, y: startP }, ...betPoints, { x: end ?? now, y: endP }],
    [betPoints, start, startP, end, endP]
  )
  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)
  const xScale = scaleTime([start, rightmostDate], [0, width])

  // clamp log scale to make sure zeroes go to the bottom
  const yScale = isLogScale
    ? scaleLog([Math.max(min, 1), max], [height, 0]).clamp(true)
    : scaleLinear([min, max], [height, 0])
  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      zoomParams={zoomParams}
      showZoomer={showZoomer}
      data={data}
      Tooltip={(props) => (
        <PseudoNumericChartTooltip
          {...props}
          dateLabel={formatDateInRange(
            // eslint-disable-next-line react/prop-types
            xScale.invert(props.x),
            start,
            rightmostDate
          )}
        />
      )}
      color={NUMERIC_GRAPH_COLOR}
    />
  )
}
