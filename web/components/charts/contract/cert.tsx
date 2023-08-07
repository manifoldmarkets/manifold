import { useMemo } from 'react'
import { last, max } from 'lodash'
import { CertContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import {
  formatDateInRange,
  getRightmostVisibleDate,
  TooltipProps,
} from '../helpers'
import { SingleValueHistoryChart } from '../generic-charts'
import { scaleLinear, scaleTime } from 'd3-scale'
import { Row } from 'web/components/layout/row'
import { HistoryPoint } from 'common/chart'

const CertChartTooltip = (props: TooltipProps<Date, HistoryPoint<never>>) => {
  const { prev, x, xScale } = props
  const [start, end] = xScale.domain()
  const d = xScale.invert(x)
  if (!prev) return null
  return (
    <Row className="items-center gap-2">
      <span className="font-semibold">{formatDateInRange(d, start, end)}</span>
      <span className="text-ink-600">{prev.y.toFixed(2)}</span>
    </Row>
  )
}

export const CertContractChart = (props: {
  cert: CertContract
  certPoints: HistoryPoint<never>[]
  width: number
  height: number
  color?: string
  onMouseOver?: (p: HistoryPoint<never> | undefined) => void
}) => {
  const { cert, certPoints, width, height, color, onMouseOver } = props
  // Certs don't use closeTime yet; setting graph end to be null means it'll use the current time
  const [start, end] = [cert.createdTime, null]

  // Set max to be the largest y value of the certPoints
  const minY = 0
  const maxY = max(props.certPoints.map((p) => p.y)) ?? 1

  const startP = props.certPoints[0]?.y ?? 1
  const endP = last(props.certPoints)?.y ?? 1

  const now = useMemo(Date.now, [certPoints])

  const data = useMemo(
    () => [{ x: start, y: startP }, ...certPoints, { x: end ?? now, y: endP }],
    [certPoints, start, startP, end, endP]
  )
  const rightmostDate = getRightmostVisibleDate(end, last(certPoints)?.x, now)
  const xScale = scaleTime([start, rightmostDate], [0, width])
  const yScale = scaleLinear([minY, maxY], [height, 0])
  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      data={data}
      onMouseOver={onMouseOver}
      Tooltip={CertChartTooltip}
      color={color ?? NUMERIC_GRAPH_COLOR}
    />
  )
}
