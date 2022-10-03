import {
  ReactNode,
  SVGProps,
  memo,
  useRef,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { pointer, select } from 'd3-selection'
import { Axis, AxisScale } from 'd3-axis'
import { brushX, D3BrushEvent } from 'd3-brush'
import { area, line, CurveFactory } from 'd3-shape'
import { nanoid } from 'nanoid'
import dayjs from 'dayjs'
import clsx from 'clsx'

import { Contract } from 'common/contract'
import { useMeasureSize } from 'web/hooks/use-measure-size'

export type Point<X, Y, T = unknown> = { x: X; y: Y; obj?: T }

export interface ContinuousScale<T> extends AxisScale<T> {
  invert(n: number): T
}

export type XScale<P> = P extends Point<infer X, infer _> ? AxisScale<X> : never
export type YScale<P> = P extends Point<infer _, infer Y> ? AxisScale<Y> : never

export const MARGIN = { top: 20, right: 10, bottom: 20, left: 40 }
export const MARGIN_X = MARGIN.right + MARGIN.left
export const MARGIN_Y = MARGIN.top + MARGIN.bottom
const MARGIN_STYLE = `${MARGIN.top}px ${MARGIN.right}px ${MARGIN.bottom}px ${MARGIN.left}px`
const MARGIN_XFORM = `translate(${MARGIN.left}, ${MARGIN.top})`

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

export const AreaWithTopStroke = <P,>(props: {
  color: string
  data: P[]
  px: number | ((p: P) => number)
  py0: number | ((p: P) => number)
  py1: number | ((p: P) => number)
  curve: CurveFactory
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
        opacity={0.2}
      />
      <LinePath data={data} px={px} py={py1} curve={curve} stroke={color} />
    </g>
  )
}

export const SVGChart = <X, TT>(props: {
  children: ReactNode
  w: number
  h: number
  xAxis: Axis<X>
  yAxis: Axis<number>
  onSelect?: (ev: D3BrushEvent<any>) => void
  onMouseOver?: (mouseX: number, mouseY: number) => TT | undefined
  Tooltip?: TooltipComponent<X, TT>
}) => {
  const { children, w, h, xAxis, yAxis, onMouseOver, onSelect, Tooltip } = props
  const [mouse, setMouse] = useState<{ x: number; y: number; data: TT }>()
  const tooltipMeasure = useMeasureSize()
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
          setMouse(undefined)
          if (overlayRef.current) {
            select(overlayRef.current).call(brush.clear)
          }
        } else {
          justSelected.current = false
        }
      })
      // mqp: shape-rendering null overrides the default d3-brush shape-rendering
      // of `crisp-edges`, which seems to cause graphical glitches on Chrome
      // (i.e. the bug where the area fill flickers white)
      select(overlayRef.current)
        .call(brush)
        .select('.selection')
        .attr('shape-rendering', 'null')
    }
  }, [innerW, innerH, onSelect])

  const onPointerMove = (ev: React.PointerEvent) => {
    if (ev.pointerType === 'mouse' && onMouseOver) {
      const [x, y] = pointer(ev)
      const data = onMouseOver(x, y)
      if (data !== undefined) {
        setMouse({ x, y, data })
      } else {
        setMouse(undefined)
      }
    }
  }

  const onPointerLeave = () => {
    setMouse(undefined)
  }

  return (
    <div className="relative overflow-hidden">
      {mouse && Tooltip && (
        <TooltipContainer
          setElem={tooltipMeasure.setElem}
          pos={getTooltipPosition(
            mouse.x,
            mouse.y,
            innerW,
            innerH,
            tooltipMeasure.width,
            tooltipMeasure.height
          )}
        >
          <Tooltip
            xScale={xAxis.scale()}
            mouseX={mouse.x}
            mouseY={mouse.y}
            data={mouse.data}
          />
        </TooltipContainer>
      )}
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <clipPath id={clipPathId}>
          <rect x={0} y={0} width={innerW} height={innerH} />
        </clipPath>
        <g transform={MARGIN_XFORM}>
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
            onPointerEnter={onPointerMove}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
          />
        </g>
      </svg>
    </div>
  )
}

export type TooltipPosition = { left: number; bottom: number }

export const getTooltipPosition = (
  mouseX: number,
  mouseY: number,
  containerWidth: number,
  containerHeight: number,
  tooltipWidth?: number,
  tooltipHeight?: number
) => {
  let left = mouseX + 12
  let bottom = containerHeight - mouseY + 12
  if (tooltipWidth != null) {
    const overflow = left + tooltipWidth - containerWidth
    if (overflow > 0) {
      left -= overflow
    }
  }
  if (tooltipHeight != null) {
    const overflow = tooltipHeight - mouseY
    if (overflow > 0) {
      bottom -= overflow
    }
  }
  return { left, bottom }
}

export type TooltipProps<X, T> = {
  mouseX: number
  mouseY: number
  xScale: ContinuousScale<X>
  data: T
}

export type TooltipComponent<X, T> = React.ComponentType<TooltipProps<X, T>>
export const TooltipContainer = (props: {
  setElem: (e: HTMLElement | null) => void
  pos: TooltipPosition
  className?: string
  children: React.ReactNode
}) => {
  const { setElem, pos, className, children } = props
  return (
    <div
      ref={setElem}
      className={clsx(
        className,
        'pointer-events-none absolute z-10 whitespace-pre rounded border border-gray-200 bg-white/80 p-2 px-4 py-2 text-xs sm:text-sm'
      )}
      style={{ margin: MARGIN_STYLE, ...pos }}
    >
      {children}
    </div>
  )
}

export const getDateRange = (contract: Contract) => {
  const { createdTime, closeTime, resolutionTime } = contract
  const isClosed = !!closeTime && Date.now() > closeTime
  const endDate = resolutionTime ?? (isClosed ? closeTime : null)
  return [createdTime, endDate ?? null] as const
}

export const getRightmostVisibleDate = (
  contractEnd: number | null | undefined,
  lastActivity: number | null | undefined,
  now: number
) => {
  if (contractEnd != null) {
    return contractEnd
  } else if (lastActivity != null) {
    // client-DB clock divergence may cause last activity to be later than now
    return Math.max(lastActivity, now)
  } else {
    return now
  }
}

export const formatPct = (n: number, digits?: number) => {
  return `${(n * 100).toFixed(digits ?? 0)}%`
}

export const formatDate = (
  date: Date,
  opts: { includeYear: boolean; includeHour: boolean; includeMinute: boolean }
) => {
  const { includeYear, includeHour, includeMinute } = opts
  const d = dayjs(date)
  const now = Date.now()
  if (
    d.add(1, 'minute').isAfter(now) &&
    d.subtract(1, 'minute').isBefore(now)
  ) {
    return 'Now'
  } else {
    const dayName = d.isSame(now, 'day')
      ? 'Today'
      : d.add(1, 'day').isSame(now, 'day')
      ? 'Yesterday'
      : null
    let format = dayName ? `[${dayName}]` : 'MMM D'
    if (includeMinute) {
      format += ', h:mma'
    } else if (includeHour) {
      format += ', ha'
    } else if (includeYear) {
      format += ', YYYY'
    }
    return d.format(format)
  }
}

export const formatDateInRange = (d: Date, start: Date, end: Date) => {
  const opts = {
    includeYear: !dayjs(start).isSame(end, 'year'),
    includeHour: dayjs(start).add(8, 'day').isAfter(end),
    includeMinute: dayjs(end).diff(start, 'hours') < 2,
  }
  return formatDate(d, opts)
}
