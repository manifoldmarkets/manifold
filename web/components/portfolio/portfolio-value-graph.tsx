import { useEffect, useMemo } from 'react'
import { scaleTime, scaleLinear } from 'd3-scale'
import { min, max } from 'lodash'
import dayjs from 'dayjs'
import { Col } from '../layout/col'
import { SingleValueHistoryChart } from 'web/components/charts/generic-charts'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { HistoryPoint } from 'common/chart'
import { curveLinear } from 'd3-shape'
import { ZoomParams } from '../charts/helpers'

export type GraphMode = 'profit' | 'value' | 'balance'

export const PortfolioTooltip = (props: { date: Date }) => {
  const d = dayjs(props.date)
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
  zoomParams?: ZoomParams
  onMouseOver?: (p: HistoryPoint<Partial<PortfolioMetrics>> | undefined) => void
  negativeThreshold?: number
}) => {
  const {
    mode,
    points,
    onMouseOver,
    width,
    height,
    zoomParams,
    negativeThreshold,
  } = props
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

  const xScale = scaleTime([minDate, maxDate], [0, width])
  const yScale = scaleLinear([minValue, maxValue], [height, 0])

  useEffect(() => {
    zoomParams?.setXScale(xScale)
  }, [])

  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      zoomParams={zoomParams}
      yKind="Ṁ"
      data={points}
      // eslint-disable-next-line react/prop-types
      Tooltip={(props) => <PortfolioTooltip date={xScale.invert(props.x)} />}
      onMouseOver={onMouseOver}
      curve={curveLinear}
      color={
        mode === 'profit'
          ? ['#14b8a6', '#F75836']
          : mode === 'balance'
          ? '#3B82F6'
          : '#4f46e5'
      }
      negativeThreshold={negativeThreshold}
    />
  )
}
