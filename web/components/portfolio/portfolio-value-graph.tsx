import { useMemo } from 'react'
import { scaleTime, scaleLinear } from 'd3-scale'
import { curveStepAfter } from 'd3-shape'
import { min, max } from 'lodash'
import dayjs from 'dayjs'
import { Col } from '../layout/col'
import { TooltipProps } from 'web/components/charts/helpers'
import {
  ControllableSingleValueHistoryChart,
  HistoryPoint,
  viewScale,
} from 'web/components/charts/generic-charts'
import { PortfolioMetrics } from 'common/portfolio-metrics'

const MARGIN = { top: 12, right: 48, bottom: 20, left: 12 }
const MARGIN_X = MARGIN.left + MARGIN.right
const MARGIN_Y = MARGIN.top + MARGIN.bottom

export type GraphMode = 'profit' | 'value'

export const PortfolioTooltip = (props: TooltipProps<Date, HistoryPoint>) => {
  const { x, xScale } = props
  const d = dayjs(xScale.invert(x))
  return (
    <Col className="text-xs font-semibold sm:text-sm">
      <div>{d.format('MMM/D/YY')}</div>
      <div className="text-2xs text-ink-600 font-normal sm:text-xs">
        {d.format('h:mm A')}
      </div>
    </Col>
  )
}

export const PortfolioGraph = (props: {
  mode: 'profit' | 'value'
  points: HistoryPoint<Partial<PortfolioMetrics>>[]
  width: number
  height: number
  viewScaleProps: viewScale
  onMouseOver?: (p: HistoryPoint<Partial<PortfolioMetrics>> | undefined) => void
}) => {
  const { mode, points, onMouseOver, width, height, viewScaleProps } = props
  const { minDate, maxDate, minValue, maxValue } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const minDate = min(points.map((d) => d.x))!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const maxDate = max(points.map((d) => d.x))!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const minValue = min(points.map((d) => d.y))!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const maxValue = max(points.map((d) => d.y))!
    return { minDate, maxDate, minValue, maxValue }
  }, [points])

  return (
    <ControllableSingleValueHistoryChart
      w={width}
      h={height}
      margin={MARGIN}
      xScale={scaleTime([minDate, maxDate], [0, width - MARGIN_X])}
      yScale={scaleLinear([minValue, maxValue], [height - MARGIN_Y, 0])}
      viewScaleProps={viewScaleProps}
      yKind="Ṁ"
      data={points}
      curve={curveStepAfter}
      Tooltip={PortfolioTooltip}
      onMouseOver={onMouseOver}
      color={
        mode === 'value'
          ? '#4f46e5'
          : (p: HistoryPoint) => (p.y >= 0 ? '#14b8a6' : '#FFA799')
      }
    />
  )
}
