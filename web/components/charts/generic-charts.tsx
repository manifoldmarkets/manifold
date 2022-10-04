import { useCallback, useMemo, useState } from 'react'
import { bisector } from 'd3-array'
import { axisBottom, axisLeft } from 'd3-axis'
import { D3BrushEvent } from 'd3-brush'
import { ScaleTime, ScaleContinuousNumeric } from 'd3-scale'
import {
  CurveFactory,
  SeriesPoint,
  curveLinear,
  curveStepBefore,
  curveStepAfter,
  stack,
  stackOrderReverse,
} from 'd3-shape'
import { range } from 'lodash'

import {
  ContinuousScale,
  Margin,
  SVGChart,
  AreaPath,
  AreaWithTopStroke,
  Point,
  SliceMarker,
  TooltipParams,
  TooltipComponent,
  computeColorStops,
  formatPct,
} from './helpers'
import { useEvent } from 'web/hooks/use-event'
import { formatMoney } from 'common/util/format'
import { nanoid } from 'nanoid'

export type MultiPoint<T = unknown> = Point<Date, number[], T>
export type HistoryPoint<T = unknown> = Point<Date, number, T>
export type DistributionPoint<T = unknown> = Point<number, number, T>
export type ValueKind = 'm$' | 'percent' | 'amount'

type SliceExtent = { y0: number; y1: number }

const interpolateY = (
  curve: CurveFactory,
  x: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number
) => {
  if (curve === curveLinear) {
    const p = (x - x0) / (x1 - x0)
    return y0 * (1 - p) + y1 * p
  } else if (curve === curveStepAfter) {
    return y0
  } else if (curve === curveStepBefore) {
    return y1
  }
}

const getTickValues = (min: number, max: number, n: number) => {
  const step = (max - min) / (n - 1)
  return [min, ...range(1, n - 1).map((i) => min + step * i), max]
}

const dataAtPointSelector = <X, Y, P extends Point<X, Y>>(
  data: P[],
  xScale: ContinuousScale<X>
) => {
  const bisect = bisector((p: P) => p.x)
  return (posX: number) => {
    const x = xScale.invert(posX)
    const i = bisect.left(data, x)
    const prev = data[i - 1] as P | undefined
    const next = data[i] as P | undefined
    return { prev, next, x: posX }
  }
}

export const DistributionChart = <P extends DistributionPoint>(props: {
  data: P[]
  w: number
  h: number
  color: string
  margin: Margin
  xScale: ScaleContinuousNumeric<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  curve?: CurveFactory
  onMouseOver?: (p: P | undefined) => void
  Tooltip?: TooltipComponent<number, P>
}) => {
  const { data, w, h, color, margin, yScale, curve, Tooltip } = props

  const [ttParams, setTTParams] = useState<TooltipParams<P>>()
  const [viewXScale, setViewXScale] =
    useState<ScaleContinuousNumeric<number, number>>()
  const xScale = viewXScale ?? props.xScale

  const px = useCallback((p: P) => xScale(p.x), [xScale])
  const py0 = yScale(yScale.domain()[0])
  const py1 = useCallback((p: P) => yScale(p.y), [yScale])

  const { xAxis, yAxis } = useMemo(() => {
    const xAxis = axisBottom<number>(xScale).ticks(w / 100)
    const yAxis = axisLeft<number>(yScale).tickFormat((n) => formatPct(n, 2))
    return { xAxis, yAxis }
  }, [w, xScale, yScale])

  const selector = dataAtPointSelector(data, xScale)
  const onMouseOver = useEvent((mouseX: number, mouseY: number) => {
    const p = selector(mouseX)
    props.onMouseOver?.(p.prev)
    if (p.prev) {
      setTTParams({ x: mouseX, y: mouseY, data: p.prev })
    } else {
      setTTParams(undefined)
    }
  })

  const onMouseLeave = useEvent(() => setTTParams(undefined))

  const onSelect = useEvent((ev: D3BrushEvent<P>) => {
    if (ev.selection) {
      const [mouseX0, mouseX1] = ev.selection as [number, number]
      setViewXScale(() =>
        xScale.copy().domain([xScale.invert(mouseX0), xScale.invert(mouseX1)])
      )
    } else {
      setViewXScale(undefined)
    }
  })

  return (
    <SVGChart
      w={w}
      h={h}
      margin={margin}
      xAxis={xAxis}
      yAxis={yAxis}
      ttParams={ttParams}
      onSelect={onSelect}
      onMouseOver={onMouseOver}
      onMouseLeave={onMouseLeave}
      Tooltip={Tooltip}
    >
      <AreaWithTopStroke
        color={color}
        data={data}
        px={px}
        py0={py0}
        py1={py1}
        curve={curve ?? curveLinear}
      />
    </SVGChart>
  )
}

export const MultiValueHistoryChart = <P extends MultiPoint>(props: {
  data: P[]
  w: number
  h: number
  colors: readonly string[]
  margin: Margin
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  yKind?: ValueKind
  curve?: CurveFactory
  onMouseOver?: (p: P | undefined) => void
  Tooltip?: TooltipComponent<Date, P>
}) => {
  const { data, w, h, colors, margin, yScale, yKind, curve, Tooltip } = props

  const [ttParams, setTTParams] = useState<TooltipParams<P>>()
  const [viewXScale, setViewXScale] = useState<ScaleTime<number, number>>()
  const xScale = viewXScale ?? props.xScale

  type SP = SeriesPoint<P>
  const px = useCallback((p: SP) => xScale(p.data.x), [xScale])
  const py0 = useCallback((p: SP) => yScale(p[0]), [yScale])
  const py1 = useCallback((p: SP) => yScale(p[1]), [yScale])

  const { xAxis, yAxis } = useMemo(() => {
    const [min, max] = yScale.domain()
    const nTicks = h < 200 ? 3 : 5
    const pctTickValues = getTickValues(min, max, nTicks)
    const xAxis = axisBottom<Date>(xScale).ticks(w / 100)
    const yAxis =
      yKind === 'percent'
        ? axisLeft<number>(yScale)
            .tickValues(pctTickValues)
            .tickFormat((n) => formatPct(n))
        : yKind === 'm$'
        ? axisLeft<number>(yScale)
            .ticks(nTicks)
            .tickFormat((n) => formatMoney(n))
        : axisLeft<number>(yScale).ticks(nTicks)
    return { xAxis, yAxis }
  }, [w, h, yKind, xScale, yScale])

  const series = useMemo(() => {
    const d3Stack = stack<P, number>()
      .keys(range(0, Math.max(...data.map(({ y }) => y.length))))
      .value(({ y }, k) => y[k])
      .order(stackOrderReverse)
    return d3Stack(data)
  }, [data])

  const selector = dataAtPointSelector(data, xScale)
  const onMouseOver = useEvent((mouseX: number, mouseY: number) => {
    const p = selector(mouseX)
    props.onMouseOver?.(p.prev)
    if (p.prev) {
      setTTParams({ x: mouseX, y: mouseY, data: p.prev })
    } else {
      setTTParams(undefined)
    }
  })

  const onMouseLeave = useEvent(() => setTTParams(undefined))

  const onSelect = useEvent((ev: D3BrushEvent<P>) => {
    if (ev.selection) {
      const [mouseX0, mouseX1] = ev.selection as [number, number]
      setViewXScale(() =>
        xScale.copy().domain([xScale.invert(mouseX0), xScale.invert(mouseX1)])
      )
    } else {
      setViewXScale(undefined)
    }
  })

  return (
    <SVGChart
      w={w}
      h={h}
      margin={margin}
      xAxis={xAxis}
      yAxis={yAxis}
      ttParams={ttParams}
      onSelect={onSelect}
      onMouseOver={onMouseOver}
      onMouseLeave={onMouseLeave}
      Tooltip={Tooltip}
    >
      {series.map((s, i) => (
        <AreaPath
          key={i}
          data={s}
          px={px}
          py0={py0}
          py1={py1}
          curve={curve ?? curveLinear}
          fill={colors[i]}
        />
      ))}
    </SVGChart>
  )
}

export const SingleValueHistoryChart = <P extends HistoryPoint>(props: {
  data: P[]
  w: number
  h: number
  color: string | ((p: P) => string)
  margin: Margin
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  yKind?: ValueKind
  curve?: CurveFactory
  onMouseOver?: (p: P | undefined) => void
  Tooltip?: TooltipComponent<Date, P>
  pct?: boolean
}) => {
  const { data, w, h, color, margin, yScale, yKind, Tooltip } = props
  const curve = props.curve ?? curveLinear

  const [mouse, setMouse] = useState<TooltipParams<P> & SliceExtent>()
  const [viewXScale, setViewXScale] = useState<ScaleTime<number, number>>()
  const xScale = viewXScale ?? props.xScale

  const px = useCallback((p: P) => xScale(p.x), [xScale])
  const py0 = yScale(yScale.domain()[0])
  const py1 = useCallback((p: P) => yScale(p.y), [yScale])

  const { xAxis, yAxis } = useMemo(() => {
    const [min, max] = yScale.domain()
    const nTicks = h < 200 ? 3 : 5
    const pctTickValues = getTickValues(min, max, nTicks)
    const xAxis = axisBottom<Date>(xScale).ticks(w / 100)
    const yAxis =
      yKind === 'percent'
        ? axisLeft<number>(yScale)
            .tickValues(pctTickValues)
            .tickFormat((n) => formatPct(n))
        : yKind === 'm$'
        ? axisLeft<number>(yScale)
            .ticks(nTicks)
            .tickFormat((n) => formatMoney(n))
        : axisLeft<number>(yScale).ticks(nTicks)
    return { xAxis, yAxis }
  }, [w, h, yKind, xScale, yScale])

  const selector = dataAtPointSelector(data, xScale)
  const onMouseOver = useEvent((mouseX: number, mouseY: number) => {
    const p = selector(mouseX)
    props.onMouseOver?.(p.prev)
    const x0 = p.prev ? xScale(p.prev.x) : xScale.range()[0]
    const x1 = p.next ? xScale(p.next.x) : xScale.range()[1]
    const y0 = p.prev ? yScale(p.prev.y) : yScale.range()[0]
    const y1 = p.next ? yScale(p.next.y) : yScale.range()[1]
    const markerY = interpolateY(curve, mouseX, x0, x1, y0, y1)
    if (p.prev && markerY) {
      setMouse({
        x: mouseX,
        y: mouseY,
        y0: py0,
        y1: markerY,
        data: p.prev,
      })
    } else {
      setMouse(undefined)
    }
  })

  const onMouseLeave = useEvent(() => setMouse(undefined))

  const onSelect = useEvent((ev: D3BrushEvent<P>) => {
    if (ev.selection) {
      const [mouseX0, mouseX1] = ev.selection as [number, number]
      setViewXScale(() =>
        xScale.copy().domain([xScale.invert(mouseX0), xScale.invert(mouseX1)])
      )
    } else {
      setViewXScale(undefined)
    }
  })

  const gradientId = useMemo(() => nanoid(), [])
  const stops = useMemo(
    () =>
      typeof color !== 'string' ? computeColorStops(data, color, px) : null,
    [color, data, px]
  )

  return (
    <SVGChart
      w={w}
      h={h}
      margin={margin}
      xAxis={xAxis}
      yAxis={yAxis}
      ttParams={
        mouse ? { x: mouse.x, y: mouse.y, data: mouse.data } : undefined
      }
      onSelect={onSelect}
      onMouseOver={onMouseOver}
      onMouseLeave={onMouseLeave}
      Tooltip={Tooltip}
    >
      {stops && (
        <defs>
          <linearGradient gradientUnits="userSpaceOnUse" id={gradientId}>
            {stops.map((s, i) => (
              <stop key={i} offset={`${s.x / w}`} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
      )}
      <AreaWithTopStroke
        color={typeof color === 'string' ? color : `url(#${gradientId})`}
        data={data}
        px={px}
        py0={py0}
        py1={py1}
        curve={curve ?? curveLinear}
      />
      {mouse && (
        <SliceMarker color="#5BCEFF" x={mouse.x} y0={mouse.y0} y1={mouse.y1} />
      )}
    </SVGChart>
  )
}
