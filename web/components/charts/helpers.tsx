import clsx from 'clsx'
import { Axis, AxisScale } from 'd3-axis'
import { pointer, select } from 'd3-selection'
import { CurveFactory, area, line } from 'd3-shape'
import { zoom } from 'd3-zoom'
import dayjs from 'dayjs'
import React, {
  ReactNode,
  SVGProps,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Contract } from 'common/contract'
import { useMeasureSize } from 'web/hooks/use-measure-size'
import { clamp } from 'lodash'
import { ScaleTime, ScaleContinuousNumeric } from 'd3-scale'

export interface ContinuousScale<T> extends AxisScale<T> {
  invert(n: number): T
}

export const XAxis = <X,>(props: { w: number; h: number; axis: Axis<X> }) => {
  const { h, axis } = props
  const axisRef = useRef<SVGGElement>(null)
  useEffect(() => {
    if (axisRef.current != null) {
      select(axisRef.current)
        .call(axis)
        .select('.domain')
        .attr('stroke-width', 0)
    }
  }, [h, axis])
  return <g ref={axisRef} transform={`translate(0, ${h})`} />
}

export const YAxis = <Y,>(props: {
  w: number
  axis: Axis<Y>
  noGridlines?: boolean
}) => {
  const { w, axis, noGridlines } = props
  const axisRef = useRef<SVGGElement>(null)

  useEffect(() => {
    if (axisRef.current != null) {
      const brush = select(axisRef.current).call(axis)

      if (!noGridlines) {
        brush.call((g) =>
          g.selectAll('.tick').each(function () {
            const tick = select(this)

            tick
              .select('line')
              .attr('x2', w)
              .attr('stroke-opacity', 0.1)
              .attr('transform', `translate(-${w}, 0)`)
          })
        )
      }
      brush.select('.domain').attr('stroke-width', 0)
    }
  }, [w, axis])

  return <g ref={axisRef} transform={`translate(${w}, 0)`} />
}

export const LinePath = <P,>(
  props: {
    data: P[]
    px: number | ((p: P) => number)
    py: number | ((p: P) => number)
    curve: CurveFactory
  } & SVGProps<SVGPathElement>
) => {
  const { px, py, curve, data: propData, ...rest } = props
  const data = useDeferredValue(propData)
  const d = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    () => line<P>(px, py).curve(curve)(data)!,
    [px, py, curve, data]
  )
  return <path {...rest} fill="none" d={d} />
}

export const AreaPath = <P,>(
  props: {
    data: P[]
    px: number | ((p: P) => number)
    py0: number | ((p: P) => number)
    py1: number | ((p: P) => number)
    curve: CurveFactory
  } & SVGProps<SVGPathElement>
) => {
  const { px, py0, py1, curve, data: propData, ...rest } = props
  const data = useDeferredValue(propData)
  const d = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    () => area<P>(px, py0, py1).curve(curve)(data)!,
    [px, py0, py1, curve, data]
  )
  return <path {...rest} d={d} />
}

export const AreaWithTopStroke = <P,>(props: {
  data: P[]
  color: string
  px: number | ((p: P) => number)
  py0: number | ((p: P) => number)
  py1: number | ((p: P) => number)
  curve: CurveFactory
  className?: string
}) => {
  const { data, color, px, py0, py1, curve, className } = props
  const last = data[data.length - 1]
  const lastX = typeof px === 'function' ? px(last) : px
  const lastY = typeof py1 === 'function' ? py1(last) : py1

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
        className={className}
      />
      <LinePath data={data} px={px} py={py1} curve={curve} stroke={color} />
      {/* a little extension so that the current value is always visible */}
      <path
        fill="none"
        d={`M${lastX},${lastY} L${lastX + 2},${lastY}`}
        stroke={color}
      />
    </g>
  )
}

export const SliceMarker = (props: {
  color: string
  x: number
  y0: number
  y1: number
}) => {
  const { color, x, y0, y1 } = props
  return (
    <g>
      <line stroke="white" strokeWidth={1} x1={x} x2={x} y1={y0} y2={y1} />
      <circle
        stroke="white"
        strokeWidth={1}
        fill={color}
        cx={x}
        cy={y1}
        r={5}
      />
    </g>
  )
}

export const SVGChart = <
  X,
  TT extends { x: number; y: number },
  S extends AxisScale<X>
>(props: {
  children: ReactNode
  w: number
  h: number
  xAxis: Axis<X>
  yAxis: Axis<number>
  ttParams?: TT | undefined
  fullScale?: S
  onRescale?: (xScale: S | null) => void
  onMouseOver?: (mouseX: number, mouseY: number) => void
  onMouseLeave?: () => void
  Tooltip?: (props: TT) => ReactNode
  noGridlines?: boolean
  className?: string
}) => {
  const {
    children,
    w,
    h,
    xAxis,
    yAxis,
    ttParams,
    fullScale,
    onRescale,
    onMouseOver,
    onMouseLeave,
    Tooltip,
    noGridlines,
    className,
  } = props
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (fullScale != null && onRescale != null && svgRef.current) {
      const zoomer = zoom<SVGSVGElement, unknown>()
        .scaleExtent([1, 100])
        .extent([
          [0, 0],
          [w, h],
        ])
        .translateExtent([
          [0, 0],
          [w, h],
        ])
        .on('zoom', (ev) => onRescale(ev.transform.rescaleX(fullScale)))
        .filter((ev) => {
          if (ev instanceof WheelEvent) {
            return ev.ctrlKey || ev.metaKey || ev.altKey
          } else if (ev instanceof TouchEvent) {
            // disable on touch devices entirely for now to not interfere with scroll
            return false
          }
          return !ev.button
        })

      select(svgRef.current)
        .call(zoomer)
        .on('dblclick.zoom', () => onRescale?.(null))
    }
  }, [w, h, fullScale, onRescale])

  const onPointerMove = (ev: React.PointerEvent) => {
    if (ev.pointerType === 'mouse' || ev.pointerType === 'pen') {
      const [x, y] = pointer(ev)
      onMouseOver?.(x, y)
    }
  }

  const onPointerLeave = () => {
    onMouseLeave?.()
  }

  const id = useId()

  if (w <= 0 || h <= 0) {
    // i.e. chart is smaller than margin
    return null
  }

  return (
    <div
      className={clsx(className, 'relative')}
      onPointerEnter={onPointerMove}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {ttParams && Tooltip && (
        <TooltipContainer
          calculatePos={(ttw, tth) =>
            getTooltipPosition(ttParams.x, ttParams.y, w, h, ttw, tth)
          }
        >
          {Tooltip(ttParams)}
        </TooltipContainer>
      )}
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        overflow="visible"
        ref={svgRef}
      >
        <defs>
          <filter id={`${id}-blur`}>
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <mask id={`${id}-mask`}>
            <rect
              x={-8}
              y={-8}
              width={w + 16}
              height={h + 16}
              fill="white"
              filter={`url(#${id}-blur)`}
            />
          </mask>
          <clipPath id={`${id}-clip`}>
            <rect x={-32} y={-32} width={w + 64} height={h + 64} />
          </clipPath>
        </defs>

        <g>
          <XAxis axis={xAxis} w={w} h={h} />

          <YAxis axis={yAxis} w={w} noGridlines={noGridlines} />
          {/* clip to stop pointer events outside of graph, and mask for the blur to indicate zoom */}
          <g clipPath={`url(#${id}-clip)`} mask={`url(#${id}-mask)`}>
            {children}
          </g>
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
  tooltipWidth: number,
  tooltipHeight: number
) => {
  let left = mouseX + 6
  let bottom = containerHeight - mouseY + 6

  left = clamp(left, 0, containerWidth - tooltipWidth)
  bottom = clamp(bottom, 0, containerHeight - tooltipHeight)

  return { left, bottom }
}

export type TooltipProps<T> = {
  x: number
  y: number
  prev: T | undefined
  next: T | undefined
  nearest: T
}

export const TooltipContainer = (props: {
  calculatePos: (width: number, height: number) => TooltipPosition
  className?: string
  children: React.ReactNode
}) => {
  const { calculatePos, className, children } = props

  const { elemRef, width, height } = useMeasureSize()
  const pos = calculatePos(width ?? 0, height ?? 0)

  return (
    <div
      ref={elemRef}
      className={clsx(
        className,
        'border-ink-200 bg-canvas-0/70 pointer-events-none absolute z-10 whitespace-pre rounded border px-4 py-2 text-sm'
      )}
      style={{ ...pos }}
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

export const formatPct = (n: number) => {
  return `${(n * 100).toFixed(0)}%`
}

export const formatDate = (
  date: Date | number,
  opts?: {
    includeYear?: boolean
    includeHour?: boolean
    includeMinute?: boolean
  }
) => {
  const { includeYear, includeHour, includeMinute } = opts ?? {}
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

export const formatDateInRange = (
  d: Date | number,
  start: Date | number,
  end: Date | number
) => {
  const opts = {
    includeYear: !dayjs(start).isSame(end, 'year'),
    includeHour: dayjs(start).add(8, 'day').isAfter(end),
    includeMinute: dayjs(end).diff(start, 'hours') < 2,
  }
  return formatDate(d, opts)
}

export const useViewScale = () => {
  const [viewXScale, setViewXScale] = useState<ScaleTime<number, number>>()
  const [viewYScale, setViewYScale] =
    useState<ScaleContinuousNumeric<number, number>>()
  return {
    viewXScale,
    setViewXScale,
    viewYScale,
    setViewYScale,
  }
}
