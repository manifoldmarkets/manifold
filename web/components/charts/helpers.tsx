import { ReactNode, SVGProps, memo, useRef, useEffect, useMemo } from 'react'
import {
  Axis,
  CurveFactory,
  D3BrushEvent,
  area,
  brushX,
  curveStepAfter,
  line,
  select,
} from 'd3'
import { nanoid } from 'nanoid'
import clsx from 'clsx'

import { Contract } from 'common/contract'

export const MARGIN = { top: 20, right: 10, bottom: 20, left: 40 }
export const MARGIN_X = MARGIN.right + MARGIN.left
export const MARGIN_Y = MARGIN.top + MARGIN.bottom

export const MAX_TIMESTAMP = 8640000000000000
export const MAX_DATE = new Date(MAX_TIMESTAMP)

export const XAxis = <X,>(props: { w: number; h: number; axis: Axis<X> }) => {
  const { h, axis } = props
  const axisRef = useRef<SVGGElement>(null)
  useEffect(() => {
    if (axisRef.current != null) {
      select(axisRef.current)
        .transition()
        .duration(250)
        .call(axis)
        .select('.domain')
        .attr('stroke-width', 0)
    }
  }, [h, axis])
  return <g ref={axisRef} transform={`translate(0, ${h})`} />
}

export const YAxis = <Y,>(props: { w: number; h: number; axis: Axis<Y> }) => {
  const { w, h, axis } = props
  const axisRef = useRef<SVGGElement>(null)
  useEffect(() => {
    if (axisRef.current != null) {
      select(axisRef.current)
        .transition()
        .duration(250)
        .call(axis)
        .call((g) =>
          g.selectAll('.tick line').attr('x2', w).attr('stroke-opacity', 0.1)
        )
        .select('.domain')
        .attr('stroke-width', 0)
    }
  }, [w, h, axis])
  return <g ref={axisRef} />
}

const LinePathInternal = <P,>(
  props: {
    data: P[]
    px: number | ((p: P) => number)
    py: number | ((p: P) => number)
    curve?: CurveFactory
  } & SVGProps<SVGPathElement>
) => {
  const { data, px, py, curve, ...rest } = props
  const d3Line = line<P>(px, py).curve(curve ?? curveStepAfter)
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
    curve?: CurveFactory
  } & SVGProps<SVGPathElement>
) => {
  const { data, px, py0, py1, curve, ...rest } = props
  const d3Area = area<P>(px, py0, py1).curve(curve ?? curveStepAfter)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return <path {...rest} d={d3Area(data)!} />
}
export const AreaPath = memo(AreaPathInternal) as typeof AreaPathInternal

export const AreaWithTopStroke = <P,>(props: {
  color: string
  data: P[]
  px: number | ((p: P) => number)
  py0: number | ((p: P) => number)
  py1: number | ((p: P) => number)
  curve?: CurveFactory
}) => {
  const { color, data, px, py0, py1, curve } = props
  return (
    <g>
      <AreaPath
        data={data}
        px={px}
        py0={py0}
        py1={py1}
        curve={curve}
        fill={color}
        opacity={0.3}
      />
      <LinePath data={data} px={px} py={py1} curve={curve} stroke={color} />
    </g>
  )
}

export const SVGChart = <X, Y>(props: {
  children: ReactNode
  w: number
  h: number
  xAxis: Axis<X>
  yAxis: Axis<Y>
  onSelect?: (ev: D3BrushEvent<any>) => void
  onMouseOver?: (ev: React.PointerEvent) => void
  onMouseLeave?: (ev: React.PointerEvent) => void
  pct?: boolean
}) => {
  const { children, w, h, xAxis, yAxis, onMouseOver, onMouseLeave, onSelect } =
    props
  const overlayRef = useRef<SVGGElement>(null)
  const innerW = w - MARGIN_X
  const innerH = h - MARGIN_Y
  const clipPathId = useMemo(() => nanoid(), [])

  const justSelected = useRef(false)
  useEffect(() => {
    if (onSelect != null && overlayRef.current) {
      const brush = brushX().extent([
        [0, 0],
        [innerW, innerH],
      ])
      brush.on('end', (ev) => {
        // when we clear the brush after a selection, that would normally cause
        // another 'end' event, so we have to suppress it with this flag
        if (!justSelected.current) {
          justSelected.current = true
          onSelect(ev)
          if (overlayRef.current) {
            select(overlayRef.current).call(brush.clear)
          }
        } else {
          justSelected.current = false
        }
      })
      select(overlayRef.current).call(brush)
    }
  }, [innerW, innerH, onSelect])

  return (
    <svg className="w-full" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <clipPath id={clipPathId}>
        <rect x={0} y={0} width={innerW} height={innerH} />
      </clipPath>
      <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
        <XAxis axis={xAxis} w={innerW} h={innerH} />
        <YAxis axis={yAxis} w={innerW} h={innerH} />
        <g clipPath={`url(#${clipPathId})`}>{children}</g>
        <g
          ref={overlayRef}
          x="0"
          y="0"
          width={innerW}
          height={innerH}
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

export type TooltipPosition = { top: number; left: number }

export const ChartTooltip = (
  props: TooltipPosition & { className?: string; children: React.ReactNode }
) => {
  const { top, left, className, children } = props
  return (
    <div
      className={clsx(
        className,
        'pointer-events-none absolute z-10 whitespace-pre rounded border-2 border-black bg-white/90 p-2'
      )}
      style={{ top, left }}
    >
      {children}
    </div>
  )
}

export const getDateRange = (contract: Contract) => {
  const { createdTime, closeTime, resolutionTime } = contract
  const isClosed = !!closeTime && Date.now() > closeTime
  const endDate = resolutionTime ?? (isClosed ? closeTime : null)
  return [new Date(createdTime), endDate ? new Date(endDate) : null] as const
}

export const getRightmostVisibleDate = (
  contractEnd: Date | null | undefined,
  lastActivity: Date | null | undefined,
  now: Date
) => {
  if (contractEnd != null) {
    return contractEnd
  } else if (lastActivity != null) {
    // client-DB clock divergence may cause last activity to be later than now
    return new Date(Math.max(lastActivity.getTime(), now.getTime()))
  } else {
    return now
  }
}
