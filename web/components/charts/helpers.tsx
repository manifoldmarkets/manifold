import clsx from 'clsx'
import { Axis } from 'd3-axis'
import { pointer, select } from 'd3-selection'
import { CurveFactory, area, line } from 'd3-shape'
import { ZoomBehavior, zoom, zoomIdentity } from 'd3-zoom'
import dayjs from 'dayjs'
import React, {
  ReactNode,
  SVGProps,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Contract } from 'common/contract'
import { useMeasureSize } from 'web/hooks/use-measure-size'
import { clamp, sortBy } from 'lodash'
import { ScaleTime, scaleTime } from 'd3-scale'
import { useEvent } from 'web/hooks/use-event'

// min number of pixels to mouse drag over to trigger zoom
const ZOOM_DRAG_THRESHOLD = 16

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

export const SVGChart = <X, TT extends { x: number; y: number }>(props: {
  children: ReactNode
  w: number
  h: number
  xAxis: Axis<X>
  yAxis: Axis<number>
  ttParams?: TT | undefined
  zoomParams?: ZoomParams
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
    zoomParams,
    onMouseOver,
    onMouseLeave,
    Tooltip,
    noGridlines,
    className,
  } = props

  const onPointerMove = (ev: React.PointerEvent) => {
    if (ev.pointerType === 'mouse' || ev.pointerType === 'pen') {
      const [x, y] = pointer(ev)
      onMouseOver?.(x, y)
    }
  }

  const { onPointerUp, selectStart, selectEnd } = useInitZoomBehavior({
    zoomParams,
    w,
    h,
  })

  useEffect(() => {
    window.addEventListener('pointerup', onPointerUp)
    return () => window.removeEventListener('pointerup', onPointerUp)
  }, [onPointerUp])

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
      className={clsx(className, 'relative cursor-crosshair select-none')}
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
      {selectStart != undefined && selectEnd != undefined && (
        // swipeover
        <div
          className={clsx(
            selectEnd - selectStart > ZOOM_DRAG_THRESHOLD
              ? 'bg-primary-400/40'
              : 'bg-canvas-100/40',
            'absolute -z-10 transition-colors'
          )}
          style={{
            left: selectStart,
            right: w - selectEnd,
            top: 0,
            bottom: 0,
          }}
        />
      )}
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        overflow="visible"
        ref={zoomParams?.svgRef}
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

export const getEndDate = (contract: Contract) => {
  const { closeTime, resolutionTime } = contract
  const isClosed = !!closeTime && Date.now() > closeTime
  const endDate = resolutionTime ?? (isClosed ? closeTime : null)
  return endDate ?? null
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

// ZOOM!

export type ZoomParams = {
  svgRef: React.MutableRefObject<SVGSVGElement | null>
  rescale: (
    scale: ScaleTime<number, number> | null,
    syncZoomer?: boolean
  ) => void
  rescaleBetween: (start: number | Date, end: number | Date) => void
  // full region
  xScale: ScaleTime<number, number>
  // visible region
  viewXScale: ScaleTime<number, number>
  // initializers
  setXScale: (xScale: ScaleTime<number, number>) => void
  setZoomer: (zoomer: ZoomBehavior<SVGSVGElement, unknown>) => void
}

export const useZoom = (
  onRescale?: (xScale: ScaleTime<number, number> | null) => void
): ZoomParams => {
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>()
  const [xScale, setXScale] = useState<ScaleTime<number, number>>(scaleTime())
  const [viewXScale, setViewXScale] = useState<ScaleTime<number, number>>(
    scaleTime()
  )

  const rescale = useCallback(
    (scale: ScaleTime<number, number> | null, syncZoomer = true) => {
      onRescale?.(scale)
      const newXScale = scale ?? xScale
      setViewXScale(() => newXScale)

      // keep zoomer in sync
      if (!xScale || !newXScale || !svgRef.current || !syncZoomer) return

      const [min, max] = xScale.domain()
      const [low, high] = newXScale.domain()

      const scaleFactor =
        (max.valueOf() - min.valueOf()) / (high.valueOf() - low.valueOf())

      const translation = newXScale(min) - newXScale(low)

      select(svgRef.current).call(
        zoomRef.current?.transform as any,
        zoomIdentity.translate(translation, 0).scale(scaleFactor)
      )
    },
    [xScale]
  )

  const rescaleBetween = (start: number | Date, end: number | Date) => {
    if (xScale) rescale(xScale.copy().domain([start, end]))
  }

  return {
    svgRef,
    rescale,
    rescaleBetween,
    setZoomer: (z) => {
      zoomRef.current = z
    },
    setXScale: (scale) => {
      setXScale(() => scale)
      setViewXScale(() => scale)
    },
    xScale: xScale ?? scaleTime(),
    viewXScale: viewXScale ?? xScale ?? scaleTime(),
  }
}

function useInitZoomBehavior(props: {
  zoomParams?: ZoomParams
  w: number
  h: number
}) {
  const { zoomParams, w, h } = props

  const [mouseDownX, setMouseDownX] = useState<number>()
  const [mouseCurrentX, setMouseCurrentX] = useState<number>()
  const [selectStart, selectEnd] = sortBy([mouseDownX, mouseCurrentX])

  useEffect(() => {
    if (!zoomParams) return
    const { setZoomer, rescale, xScale, svgRef } = zoomParams
    if (!svgRef.current) return

    const zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, Infinity])
      .extent([
        [0, 0],
        [w, h],
      ])
      .translateExtent([
        [0, 0],
        [w, h],
      ])
      .on('zoom', (ev) => {
        if (ev.sourceEvent) {
          rescale(ev.transform.rescaleX(xScale), false)
        }
      })
      .filter((ev) => {
        if (ev instanceof WheelEvent) {
          return ev.ctrlKey || ev.metaKey || ev.altKey
        } else if (ev instanceof TouchEvent) {
          // return false
          return ev.touches.length === 2
        }
        return !ev.button
      })

    setZoomer(zoomer)
    select(svgRef.current)
      .call(zoomer)
      .on('dblclick.zoom', () => rescale(null))
      .on('mousedown.zoom', (ev) => {
        const [x] = pointer(ev)
        setMouseDownX(x)
      })
      .on('mousemove.zoom', (ev) => {
        const [x] = pointer(ev)
        setMouseCurrentX(x)
      })
  }, [w, h, zoomParams?.svgRef.current])

  const onPointerUp = useEvent(() => {
    if (
      zoomParams &&
      selectStart != null &&
      selectEnd != null &&
      selectEnd - selectStart > ZOOM_DRAG_THRESHOLD
    ) {
      const xScale = zoomParams.viewXScale

      const start = xScale.invert(selectStart)
      const end = xScale.invert(selectEnd)

      if (start && end) {
        zoomParams?.rescaleBetween(start, end)
      }
    }
    setMouseDownX(undefined)
  })

  return { onPointerUp, selectStart, selectEnd }
}
