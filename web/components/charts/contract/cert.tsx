import { useMemo } from 'react'
import { last, max, sortBy } from 'lodash'
import { curveStepAfter } from 'd3-shape'

import { DAY_MS } from 'common/util/time'
import { CertContract } from 'common/contract'
import { NUMERIC_GRAPH_COLOR } from 'common/numeric-constants'
import {
  formatDateInRange,
  getRightmostVisibleDate,
  TooltipProps,
} from '../helpers'
import { HistoryPoint, SingleValueHistoryChart } from '../generic-charts'
import { scaleLinear, scaleTime } from 'd3-scale'
import { CertTxn } from 'common/txn'
import { Row } from 'web/components/layout/row'

const MARGIN = { top: 20, right: 40, bottom: 20, left: 10 }
const MARGIN_X = MARGIN.left + MARGIN.right
const MARGIN_Y = MARGIN.top + MARGIN.bottom

const CertChartTooltip = (
  props: TooltipProps<Date, HistoryPoint<Partial<CertTxn>>>
) => {
  const { prev, x, xScale } = props
  const [start, end] = xScale.domain()
  const d = xScale.invert(x)
  if (!prev) return null
  return (
    <Row className="items-center gap-2">
      {/* {prev.obj?.userAvatarUrl && (
        <Avatar size="xs" avatarUrl={prev.obj.userAvatarUrl} />
      )}{' '} */}
      <span className="font-semibold">{formatDateInRange(d, start, end)}</span>
      <span className="text-gray-600">{prev.y.toFixed(2)}</span>
    </Row>
  )
}

export const CertContractChart = (props: {
  cert: CertContract
  certPoints: HistoryPoint<CertTxn>[]
  width: number
  height: number
  color?: string
  onMouseOver?: (p: HistoryPoint<Partial<CertTxn>> | undefined) => void
}) => {
  const { cert, width, height, color, onMouseOver } = props
  const [start, end] = [cert.createdTime, Date.now()]
  const minY = 0
  // Set max to be the largest y value of the certPoints
  const maxY = max(props.certPoints.map((p) => p.y)) ?? 1

  const startP = props.certPoints[0]?.y ?? 1
  const endP = last(props.certPoints)?.y ?? 1

  const certPoints = useMemo(
    () => sortBy(props.certPoints, (p) => p.x),
    [props.certPoints]
  )
  const data = useMemo(
    () => [
      { x: start, y: startP },
      ...certPoints,
      { x: end ?? Date.now() + DAY_MS, y: endP },
    ],
    [certPoints, start, startP, end, endP]
  )
  const rightmostDate = getRightmostVisibleDate(
    end,
    last(certPoints)?.x,
    Date.now()
  )
  const visibleRange = [start, rightmostDate]
  const xScale = scaleTime(visibleRange, [0, width - MARGIN_X])
  const yScale = scaleLinear([minY, maxY], [height - MARGIN_Y, 0])
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
      Tooltip={CertChartTooltip}
      color={color ?? NUMERIC_GRAPH_COLOR}
    />
  )
}
