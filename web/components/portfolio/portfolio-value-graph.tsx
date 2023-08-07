import { useMemo } from 'react'
import { scaleTime, scaleLinear } from 'd3-scale'
import { min, max } from 'lodash'
import dayjs from 'dayjs'
import { Col } from '../layout/col'
import { TooltipProps } from 'web/components/charts/helpers'
import { ControllableSingleValueHistoryChart } from 'web/components/charts/generic-charts'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { HistoryPoint, viewScale } from 'common/chart'
import { curveLinear } from 'd3-shape'

export type GraphMode = 'profit' | 'value' | 'balance'

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
  mode: 'profit' | 'value' | 'balance'
  points: HistoryPoint<Partial<PortfolioMetrics>>[]
  width: number
  height: number
  viewScaleProps: viewScale
  onMouseOver?: (p: HistoryPoint<Partial<PortfolioMetrics>> | undefined) => void
  negativeThreshold?: number
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
  const negativeThreshold = props.negativeThreshold ?? 0
  return (
    <ControllableSingleValueHistoryChart
      w={width}
      h={height}
      xScale={scaleTime([minDate, maxDate], [0, width])}
      yScale={scaleLinear([minValue, maxValue], [height, 0])}
      viewScaleProps={viewScaleProps}
      yKind="Ṁ"
      data={points}
      Tooltip={PortfolioTooltip}
      onMouseOver={onMouseOver}
      curve={curveLinear}
      color={
        mode === 'profit'
          ? (p: HistoryPoint) => (p.y >= 0 ? '#14b8a6' : '#FFA799')
          : mode === 'balance'
          ? '#3B82F6'
          : '#4f46e5'
      }
      negativeThreshold={negativeThreshold}
    />
  )
}
