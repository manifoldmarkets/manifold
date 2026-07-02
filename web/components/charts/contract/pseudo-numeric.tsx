import { useMemo } from 'react'
import { last } from 'lodash'
import { scaleTime, scaleLog, scaleLinear } from 'd3-scale'
import { getInitialProbability, getProbability } from 'common/calculate'
import { formatLargeNumber } from 'common/util/format'
import { PseudoNumericContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import {
  getEndDate,
  getRightmostVisibleDate,
  getVisibleNumericYRange,
  ZoomParams,
} from '../helpers'
import { SingleValueHistoryChart } from '../generic-charts'
import { SingleContractChartTooltip, SingleContractPoint } from './single-value'

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
  bets: SingleContractPoint[],
  scaleP: (p: number) => number
) => {
  return bets.map((pt) => ({ x: pt.x, y: scaleP(pt.y), obj: pt.obj }))
}

export const PseudoNumericContractChart = (props: {
  contract: PseudoNumericContract
  betPoints: SingleContractPoint[]
  width: number
  height: number
  zoomParams?: ZoomParams
  showZoomer?: boolean
  zoomY?: boolean
}) => {
  const { contract, width, height, zoomParams, showZoomer, zoomY } = props
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

  const [yMin, yMax] = getVisibleNumericYRange({
    data,
    contractMin: min,
    contractMax: max,
    zoomY,
    zoomParams,
  })
  const isYZoomed = yMin !== min || yMax !== max

  // clamp log scale to make sure zeroes go to the bottom.
  // Skip .nice() on log scale: it rounds to powers of 10 and would expand
  // a zoomed range like [10, 14] back out to [10, 100].
  const yScale = isLogScale
    ? scaleLog([Math.max(yMin, 1), yMax], [height, 0]).clamp(true)
    : scaleLinear([yMin, yMax], [height, 0])
  if (isYZoomed && !isLogScale) yScale.nice()
  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      zoomParams={zoomParams}
      showZoomer={showZoomer}
      data={data}
      yTickFormat={formatLargeNumber}
      Tooltip={(props) => (
        <SingleContractChartTooltip
          ttProps={props}
          xScale={zoomParams?.viewXScale ?? xScale}
          formatY={formatLargeNumber}
        />
      )}
      color={NUMERIC_GRAPH_COLOR}
    />
  )
}
