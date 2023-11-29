import { useMemo } from 'react'
import { first, last } from 'lodash'
import { scaleTime, scaleLinear } from 'd3-scale'
import { getProbability } from 'common/calculate'
import { BinaryContract } from 'common/contract'
import {
  TooltipProps,
  getEndDate,
  getRightmostVisibleDate,
  formatDateInRange,
  formatPct,
  ZoomParams,
} from '../helpers'
import { SingleValueHistoryChart } from '../generic-charts'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { YES_GRAPH_COLOR } from 'common/envs/constants'
import { HistoryPoint } from 'common/chart'

type BinaryPoint = HistoryPoint<{ userAvatarUrl?: string }>

const BinaryChartTooltip = (
  props: TooltipProps<BinaryPoint> & { dateLabel: string }
) => {
  const { prev, next, dateLabel } = props
  if (!prev) return null

  return (
    <Row className="items-center gap-2">
      {prev.obj?.userAvatarUrl && (
        <Avatar size="xs" avatarUrl={prev.obj.userAvatarUrl} />
      )}
      <span className="font-semibold">{next ? dateLabel : 'Now'}</span>
      <span className="text-ink-600">{formatPct(prev.y)}</span>
    </Row>
  )
}

export const BinaryContractChart = (props: {
  contract: BinaryContract
  betPoints: BinaryPoint[]
  width: number
  height: number
  zoomParams?: ZoomParams
  percentBounds?: { max?: number; min?: number }
  showZoomer?: boolean
}) => {
  const {
    contract,
    width,
    height,
    zoomParams,
    percentBounds,
    betPoints,
    showZoomer,
  } = props

  const start = first(betPoints)?.x ?? contract.createdTime
  const end = getEndDate(contract)
  const endP = getProbability(contract)

  const now = useMemo(() => Date.now(), [betPoints])

  const data = useMemo(() => {
    return [...betPoints, { x: end ?? now, y: endP }]
  }, [end, endP, betPoints])

  const rightmostDate = getRightmostVisibleDate(end, last(betPoints)?.x, now)

  const xScale = scaleTime([start, rightmostDate], [0, width])
  const yScale = scaleLinear(
    [percentBounds?.min ?? 0, percentBounds?.max ?? 1],
    [height, 0]
  )

  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      zoomParams={zoomParams}
      showZoomer={showZoomer}
      yKind="percent"
      data={data}
      color={YES_GRAPH_COLOR}
      Tooltip={(props) => (
        <BinaryChartTooltip
          {...props}
          dateLabel={formatDateInRange(
            // eslint-disable-next-line react/prop-types
            xScale.invert(props.x) ?? 0,
            start,
            rightmostDate
          )}
        />
      )}
    />
  )
}
