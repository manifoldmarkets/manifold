import { useMemo } from 'react'
import { scaleTime, scaleLinear } from 'd3-scale'
import { curveStepAfter } from 'd3-shape'
import { min, max } from 'lodash'
import dayjs from 'dayjs'
import { PortfolioMetrics } from 'common/user'
import { Col } from '../layout/col'
import { TooltipProps } from 'web/components/charts/helpers'
import {
  ControllableSingleValueHistoryChart,
  HistoryPoint,
  viewScale,
} from 'web/components/charts/generic-charts'

const MARGIN = { top: 20, right: 10, bottom: 20, left: 70 }
const MARGIN_X = MARGIN.left + MARGIN.right
const MARGIN_Y = MARGIN.top + MARGIN.bottom

export type GraphMode = 'profit' | 'value'

export const PortfolioTooltip = (props: TooltipProps<Date, HistoryPoint>) => {
  const { x, xScale } = props
  const d = dayjs(xScale.invert(x))
  return (
    <Col className="text-xs font-semibold sm:text-sm">
      <div>{d.format('MMM/D/YY')}</div>
      <div className="text-greyscale-6 text-2xs font-normal sm:text-xs">
        {d.format('h:mm A')}
      </div>
    </Col>
  )
}

const getY = (mode: GraphMode, p: PortfolioMetrics) =>
  p.balance + p.investmentValue - (mode === 'profit' ? p.totalDeposits : 0)

export function getPoints(mode: GraphMode, history: PortfolioMetrics[]) {
  return history.map((p) => ({
    x: new Date(p.timestamp),
    y: getY(mode, p),
    obj: p,
  }))
}

export const PortfolioGraph = (props: {
  mode: 'profit' | 'value'
  history: PortfolioMetrics[]
  width: number
  height: number
  viewScaleProps: viewScale
  onMouseOver?: (p: HistoryPoint<PortfolioMetrics> | undefined) => void
}) => {
  const { mode, history, onMouseOver, width, height, viewScaleProps } = props
  const { data, minDate, maxDate, minValue, maxValue } = useMemo(() => {
    const data = getPoints(mode, history)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const minDate = min(data.map((d) => d.x))!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const maxDate = max(data.map((d) => d.x))!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const minValue = min(data.map((d) => d.y))!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const maxValue = max(data.map((d) => d.y))!
    return { data, minDate, maxDate, minValue, maxValue }
  }, [mode, history])

  return (
    <ControllableSingleValueHistoryChart
      w={width}
      h={height}
      margin={MARGIN}
      xScale={scaleTime([minDate, maxDate], [0, width - MARGIN_X])}
      yScale={scaleLinear([minValue, maxValue], [height - MARGIN_Y, 0])}
      viewScaleProps={viewScaleProps}
      yKind="m$"
      data={data}
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
