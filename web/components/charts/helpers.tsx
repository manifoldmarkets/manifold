import clsx from 'clsx'
import { Axis, AxisScale } from 'd3-axis'
import { D3BrushEvent, brushX } from 'd3-brush'
import { pointer, select } from 'd3-selection'
import { CurveFactory, area, line } from 'd3-shape'
import dayjs from 'dayjs'
import {
  ComponentType,
  ReactNode,
  SVGProps,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Margin } from 'common/chart'
import { Contract } from 'common/contract'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useMeasureSize } from 'web/hooks/use-measure-size'
import { Tooltip } from '../widgets/tooltip'

export interface ContinuousScale<T> extends AxisScale<T> {
  invert(n: number): T
}

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

export const YAxis = <Y,>(props: {
  w: number
  h: number
  axis: Axis<Y>
  negativeThreshold?: number
}) => {
  const { w, h, axis, negativeThreshold = 0 } = props
  const axisRef = useRef<SVGGElement>(null)

  const [showTooltip, setShowTooltip] = useState(false)

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
                .on('mouseover', function () {
                  setShowTooltip(true)
                })
                .on('mouseout', function () {
                  setShowTooltip(false)
                })
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

  return (
    <>
      <g ref={axisRef} transform={`translate(${w}, 0)`} />
      <div className="bg-red-500 text-lg">
        value at the beginning of the week
      </div>
    </>
  )
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
}) => {
  const { data, color, px, py0, py1, curve } = props
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

export const SVGChart = <X, TT>(props: {
  children: ReactNode
  w: number
  h: number
  margin: Margin
  xAxis: Axis<X>
  yAxis: Axis<number>
  ttParams?: TooltipParams<TT> | undefined
  onSelect?: (ev: D3BrushEvent<any>) => void
  onMouseOver?: (mouseX: number, mouseY: number) => void
  onMouseLeave?: () => void
  Tooltip?: TooltipComponent<X, TT>
  negativeThreshold?: number
}) => {
  const {
    children,
    w,
    h,
    margin,
    xAxis,
    yAxis,
    ttParams,
    onSelect,
    onMouseOver,
    onMouseLeave,
    Tooltip,
    negativeThreshold,
  } = props
  const tooltipMeasure = useMeasureSize()
  const overlayRef = useRef<SVGGElement>(null)
  const innerW = w - (margin.left + margin.right)
  const innerH = h - (margin.top + margin.bottom)
  const clipPathId = useId()
  const isMobile = useIsMobile()

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
          onMouseLeave?.()
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
  }, [innerW, innerH, onSelect, onMouseLeave])

  const onPointerMove = (ev: React.PointerEvent) => {
    if (ev.pointerType === 'mouse' && onMouseOver) {
      const [x, y] = pointer(ev)
      onMouseOver(x, y)
    }
  }

  const onTouchMove = (ev: React.TouchEvent) => {
    if (onMouseOver) {
      const touch = ev.touches[0]
      const x = touch.pageX - ev.currentTarget.getBoundingClientRect().left
      const y = touch.pageY - ev.currentTarget.getBoundingClientRect().top
      onMouseOver(x, y)
    }
  }

  const onPointerLeave = () => {
    onMouseLeave?.()
  }

  if (innerW <= 0 || innerH <= 0) {
    // i.e. chart is smaller than margin
    return null
  }

  return (
    <div className="relative overflow-hidden">
      {ttParams && Tooltip && (
        <TooltipContainer
          setElem={tooltipMeasure.setElem}
          margin={margin}
          pos={getTooltipPosition(
            ttParams.x,
            ttParams.y,
            innerW,
            innerH,
            tooltipMeasure.width ?? 140,
            tooltipMeasure.height ?? 35,
            isMobile ?? false
          )}
        >
          <Tooltip xScale={xAxis.scale()} {...ttParams} />
        </TooltipContainer>
      )}
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <clipPath id={clipPathId}>
          <rect x={0} y={0} width={innerW} height={innerH} />
        </clipPath>
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          <XAxis axis={xAxis} w={innerW} h={innerH} />
          <YAxis
            axis={yAxis}
            w={innerW}
            h={innerH}
            negativeThreshold={negativeThreshold}
          />
          <g clipPath={`url(#${clipPathId})`}>{children}</g>
          {!isMobile ? (
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
          ) : (
            <rect
              x="0"
              y="0"
              width={innerW}
              height={innerH}
              fill="transparent"
              onTouchMove={onTouchMove}
              onTouchEnd={onPointerLeave}
            />
          )}
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
  tooltipHeight: number,
  isMobile: boolean
) => {
  let left = mouseX + 12
  let bottom = !isMobile
    ? containerHeight - mouseY + 12
    : containerHeight - tooltipHeight + 12
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

export type TooltipParams<T> = {
  x: number
  y: number
  prev: T | undefined
  next: T | undefined
  nearest: T
}
export type TooltipProps<X, T> = TooltipParams<T> & {
  xScale: ContinuousScale<X>
}

export type TooltipComponent<X, T> = ComponentType<TooltipProps<X, T>>
export const TooltipContainer = (props: {
  setElem: (e: HTMLElement | null) => void
  pos: TooltipPosition
  margin: Margin
  className?: string
  children: React.ReactNode
}) => {
  const { setElem, pos, margin, className, children } = props
  return (
    <div
      ref={setElem}
      className={clsx(
        className,
        'border-ink-200 bg-canvas-0/70 pointer-events-none absolute z-10 whitespace-pre rounded border p-2 px-4 py-2 text-xs sm:text-sm'
      )}
      style={{
        margin: `${margin.top}px ${margin.right}px ${margin.bottom}px ${margin.left}px`,
        ...pos,
      }}
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
