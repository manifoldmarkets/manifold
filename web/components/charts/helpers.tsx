import { ReactNode, SVGProps, memo, useRef, useEffect } from 'react'
import { Axis, AxisDomain, CurveFactory, area, line, select } from 'd3'
import dayjs from 'dayjs'

import { Contract } from 'common/contract'

export const MARGIN = { top: 20, right: 10, bottom: 20, left: 40 }
export const MARGIN_X = MARGIN.right + MARGIN.left
export const MARGIN_Y = MARGIN.top + MARGIN.bottom

export const XAxis = <X extends AxisDomain>(props: {
  w: number
  h: number
  axis: Axis<X>
}) => {
  const { h, axis } = props
  const axisRef = useRef<SVGGElement>(null)
  useEffect(() => {
    if (axisRef.current != null) {
      select(axisRef.current)
        .call(axis)
        .call((g) => g.select('.domain').remove())
    }
  }, [h, axis])
  return <g ref={axisRef} transform={`translate(0, ${h})`} />
}

export const YAxis = <Y extends AxisDomain>(props: {
  w: number
  h: number
  axis: Axis<Y>
}) => {
  const { w, h, axis } = props
  const axisRef = useRef<SVGGElement>(null)
  useEffect(() => {
    if (axisRef.current != null) {
      select(axisRef.current)
        .call(axis)
        .call((g) => g.select('.domain').remove())
        .call((g) =>
          g.selectAll('.tick line').attr('x2', w).attr('stroke-opacity', 0.1)
        )
    }
  }, [w, h, axis])
  return <g ref={axisRef} />
}

const LinePathInternal = <P,>(
  props: {
    data: P[]
    px: number | ((p: P) => number)
    py: number | ((p: P) => number)
    curve: CurveFactory
  } & SVGProps<SVGPathElement>
) => {
  const { data, px, py, curve, ...rest } = props
  const d3Line = line<P>(px, py).curve(curve)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return <path {...rest} fill="none" d={d3Line(data)!} />
}
export const LinePath = memo(LinePathInternal) as typeof LinePathInternal

const AreaPathInternal = <P,>(
  props: {
    data: P[]
    px: number | ((p: P) => number)
    py0: number | ((p: P) => number)
    py1: number | ((p: P) => number)
    curve: CurveFactory
  } & SVGProps<SVGPathElement>
) => {
  const { data, px, py0, py1, curve, ...rest } = props
  const d3Area = area<P>(px, py0, py1).curve(curve)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return <path {...rest} d={d3Area(data)!} />
}
export const AreaPath = memo(AreaPathInternal) as typeof AreaPathInternal

export const SVGChart = <X extends AxisDomain, Y extends AxisDomain>(props: {
  children: ReactNode
  w: number
  h: number
  xAxis: Axis<X>
  yAxis: Axis<Y>
  onMouseOver?: (ev: React.PointerEvent) => void
  onMouseLeave?: (ev: React.PointerEvent) => void
  pct?: boolean
}) => {
  const { children, w, h, xAxis, yAxis, onMouseOver, onMouseLeave } = props
  const innerW = w - MARGIN_X
  const innerH = h - MARGIN_Y
  return (
    <svg className="w-full" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
        <XAxis axis={xAxis} w={innerW} h={innerH} />
        <YAxis axis={yAxis} w={innerW} h={innerH} />
        {children}
        <rect
          x="0"
          y="0"
          width={w - MARGIN_X}
          height={h - MARGIN_Y}
          fill="none"
          pointerEvents="all"
          onPointerEnter={onMouseOver}
          onPointerMove={onMouseOver}
          onPointerLeave={onMouseLeave}
        />
      </g>
    </svg>
  )
}

export const getDateRange = (contract: Contract) => {
  const { createdTime, closeTime, resolutionTime } = contract
  const now = Date.now()
  const isClosed = !!closeTime && now > closeTime
  const endDate = resolutionTime ?? (isClosed ? closeTime : now)
  // the graph should be minimum an hour wide
  const adjustedEndDate = dayjs(createdTime).add(1, 'hour').isAfter(endDate)
    ? dayjs(endDate).add(1, 'hours')
    : dayjs(endDate)
  return [new Date(createdTime), adjustedEndDate.toDate()] as const
}
