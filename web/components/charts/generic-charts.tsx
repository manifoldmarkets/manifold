import { useCallback, useMemo, useState } from 'react'
import { bisector } from 'd3-array'
import { axisBottom, axisLeft } from 'd3-axis'
import { D3BrushEvent } from 'd3-brush'
import { ScaleTime, ScaleContinuousNumeric } from 'd3-scale'
import {
  CurveFactory,
  SeriesPoint,
  curveLinear,
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

const getTickValues = (min: number, max: number, n: number) => {
  const step = (max - min) / (n - 1)
  return [min, ...range(1, n - 1).map((i) => min + step * i), max]
}

const betAtPointSelector = <X, Y, P extends Point<X, Y>>(
  data: P[],
  xScale: ContinuousScale<X>
) => {
  const bisect = bisector((p: P) => p.x)
  return (posX: number) => {
    const x = xScale.invert(posX)
    const item = data[bisect.left(data, x) - 1]
    const result = item ? { ...item, x: posX } : undefined
    return result
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

  const selector = betAtPointSelector(data, xScale)
  const onMouseOver = useEvent((mouseX: number) => {
    const p = selector(mouseX)
    props.onMouseOver?.(p)
    return p
  })

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
      onSelect={onSelect}
      onMouseOver={onMouseOver}
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

  const selector = betAtPointSelector(data, xScale)
  const onMouseOver = useEvent((mouseX: number) => {
    const p = selector(mouseX)
    props.onMouseOver?.(p)
    return p
  })

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
      onSelect={onSelect}
      onMouseOver={onMouseOver}
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
  const { data, w, h, color, margin, yScale, yKind, curve, Tooltip } = props

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

  const selector = betAtPointSelector(data, xScale)
  const onMouseOver = useEvent((mouseX: number) => {
    const p = selector(mouseX)
    props.onMouseOver?.(p)
    return p
  })

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
      onSelect={onSelect}
      onMouseOver={onMouseOver}
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
    </SVGChart>
  )
}
