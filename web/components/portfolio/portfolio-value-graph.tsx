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
import { Period } from 'web/lib/firebase/users'

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
  duration?: Period
  points: HistoryPoint<Partial<PortfolioMetrics>>[]
  width: number
  height: number
  zoomParams?: ZoomParams
  onMouseOver?: (p: HistoryPoint<Partial<PortfolioMetrics>> | undefined) => void
  negativeThreshold?: number
  hideXAxis?: boolean
}) => {
  const {
    mode,
    duration,
    points,
    onMouseOver,
    width,
    height,
    zoomParams,
    negativeThreshold,
    hideXAxis,
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
  const tinyDiff = Math.abs(maxValue - minValue) < 20
  const xScale = scaleTime([minDate, maxDate], [0, width])
  const yScale = scaleLinear(
    [tinyDiff ? minValue - 50 : minValue, tinyDiff ? maxValue + 50 : maxValue],
    [height, 0]
  )

  // reset axis scale if mode or duration change (since points change)
  useEffect(() => {
    zoomParams?.setXScale(xScale)
  }, [mode, duration])

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
      hideXAxis={hideXAxis}
    />
  )
}
