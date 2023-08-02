import clsx from 'clsx'
import { Axis, AxisScale } from 'd3-axis'
import { pointer, select } from 'd3-selection'
import { CurveFactory, area, line } from 'd3-shape'
import { zoom } from 'd3-zoom'
import dayjs from 'dayjs'
import {
  ComponentType,
  ReactNode,
  SVGProps,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { Contract } from 'common/contract'
import { useMeasureSize } from 'web/hooks/use-measure-size'
import { clamp } from 'lodash'

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

export const SimpleYAxis = <Y,>(props: { w: number; axis: Axis<Y> }) => {
  const { w, axis } = props
  const axisRef = useRef<SVGGElement>(null)
  useEffect(() => {
    if (axisRef.current != null) {
      select(axisRef.current)
        .call(axis)
        .select('.domain')
        .attr('stroke-width', 0)
    }
  }, [w, axis])
  return <g ref={axisRef} transform={`translate(${w}, 0)`} />
}

// horizontal gridlines
export const YAxis = <Y,>(props: {
  w: number
  h: number
  axis: Axis<Y>
  negativeThreshold?: number
}) => {
  const { w, h, axis, negativeThreshold = 0 } = props
  const axisRef = useRef<SVGGElement>(null)

  useEffect(() => {
    if (axisRef.current != null) {
      select(axisRef.current)
        .call(axis)
        .call((g) =>
          g.selectAll('.tick').each(function (d) {
            const tick = select(this)
            if (negativeThreshold && d === negativeThreshold) {
              const color = negativeThreshold >= 0 ? '#0d9488' : '#FF2400'
              tick
                .select('line') // Change stroke of the line
                .attr('x2', w)
                .attr('stroke-opacity', 1)
                .attr('stroke-dasharray', '10,5') // Make the line dotted
                .attr('transform', `translate(-${w}, 0)`)
                .attr('stroke', color)

              tick
                .select('text') // Change font of the text
                .style('font-weight', 'bold') // Adjust this to your needs
                .attr('fill', color)
            } else {
              tick
                .select('line')
                .attr('x2', w)
                .attr('stroke-opacity', 0.1)
                .attr('transform', `translate(-${w}, 0)`)
            }
          })
        )
        .select('.domain')
        .attr('stroke-width', 0)
    }
  }, [w, h, axis, negativeThreshold])

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

export const SVGChart = <X, TT, S extends AxisScale<X>>(props: {
  children: ReactNode
  w: number
  h: number
  xAxis: Axis<X>
  yAxis: Axis<number>
  ttParams?: TooltipParams<TT> | undefined
  fullScale?: S
  onRescale?: (xScale: S | null) => void
  onMouseOver?: (mouseX: number, mouseY: number) => void
  onMouseLeave?: () => void
  Tooltip?: TooltipComponent<X, TT>
  negativeThreshold?: number
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
    negativeThreshold,
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
          return !ev.butt
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
          <Tooltip
            xScale={xAxis.scale()}
            yScale={yAxis.scale() as ContinuousScale<number>}
            {...ttParams}
          />
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
          <filter id="blur">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <mask id="mask">
            <rect
              x={-8}
              y={-8}
              width={w + 16}
              height={h + 16}
              fill="white"
              filter="url(#blur)"
            />
          </mask>
          <clipPath id="clip">
            <rect x={-32} y={-32} width={w + 64} height={h + 64} />
          </clipPath>
        </defs>

        <g>
          <XAxis axis={xAxis} w={w} h={h} />
          {noGridlines ? (
            <SimpleYAxis axis={yAxis} w={w} />
          ) : (
            <YAxis
              axis={yAxis}
              w={w}
              h={h}
              negativeThreshold={negativeThreshold}
            />
          )}
          {/* clip to stop pointer events outside of graph, and mask for the blur to indicate zoom */}
          <g clipPath="url(#clip)">
            <g mask="url(#mask)">{children}</g>
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

export type TooltipParams<T> = {
  x: number
  y: number
  prev: T | undefined
  next: T | undefined
  nearest: T
}
export type TooltipProps<X, T> = TooltipParams<T> & {
  xScale: ContinuousScale<X>
  yScale?: ContinuousScale<number>
}

export type TooltipComponent<X, T> = ComponentType<TooltipProps<X, T>>
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
export const computeColorStops = <P,>(
  data: P[],
  pc: (p: P) => string,
  px: (p: P) => number
) => {
  const segments: { x: number; color: string }[] = []
  let currOffset = px(data[0])
  let currColor = pc(data[0])
  for (const p of data) {
    const c = pc(p)
    if (c !== currColor) {
      segments.push({ x: currOffset, color: currColor })
      currOffset = px(p)
      currColor = c
    }
  }
  segments.push({ x: currOffset, color: currColor })

  const stops: { x: number; color: string }[] = []
  stops.push({ x: segments[0].x, color: segments[0].color })
  for (const s of segments.slice(1)) {
    stops.push({ x: s.x, color: stops[stops.length - 1].color })
    stops.push({ x: s.x, color: s.color })
  }
  return stops
}
