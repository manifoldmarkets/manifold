import { useCallback, useMemo, useState } from 'react'
import { bisector } from 'd3-array'
import { axisBottom, axisLeft } from 'd3-axis'
import { D3BrushEvent } from 'd3-brush'
import { ScaleTime, ScaleContinuousNumeric } from 'd3-scale'
import { pointer } from 'd3-selection'
import {
  curveLinear,
  curveStepAfter,
  stack,
  stackOrderReverse,
  SeriesPoint,
} from 'd3-shape'
import { range } from 'lodash'

import {
  SVGChart,
  AreaPath,
  AreaWithTopStroke,
  TooltipContent,
  TooltipContainer,
  TooltipPosition,
  formatPct,
} from './helpers'
import { useEvent } from 'web/hooks/use-event'

export type MultiPoint<T = never> = { x: Date; y: number[]; datum?: T }
export type HistoryPoint<T = never> = { x: Date; y: number; datum?: T }
export type DistributionPoint<T = never> = { x: number; y: number; datum?: T }

type PositionValue<P> = TooltipPosition & { p: P }

const getTickValues = (min: number, max: number, n: number) => {
  const step = (max - min) / (n - 1)
  return [min, ...range(1, n - 1).map((i) => min + step * i), max]
}

export const SingleValueDistributionChart = <T,>(props: {
  data: DistributionPoint<T>[]
  w: number
  h: number
  color: string
  xScale: ScaleContinuousNumeric<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  Tooltip?: TooltipContent<SingleValueDistributionTooltipProps<T>>
}) => {
  const { color, data, yScale, w, h, Tooltip } = props

  const [viewXScale, setViewXScale] =
    useState<ScaleContinuousNumeric<number, number>>()
  const [mouseState, setMouseState] =
    useState<PositionValue<DistributionPoint<T>>>()
  const xScale = viewXScale ?? props.xScale

  const px = useCallback((p: DistributionPoint<T>) => xScale(p.x), [xScale])
  const py0 = yScale(yScale.domain()[0])
  const py1 = useCallback((p: DistributionPoint<T>) => yScale(p.y), [yScale])
  const xBisector = bisector((p: DistributionPoint<T>) => p.x)

  const { xAxis, yAxis } = useMemo(() => {
    const xAxis = axisBottom<number>(xScale).ticks(w / 100)
    const yAxis = axisLeft<number>(yScale).tickFormat((n) => formatPct(n, 2))
    return { xAxis, yAxis }
  }, [w, xScale, yScale])

  const onSelect = useEvent((ev: D3BrushEvent<DistributionPoint<T>>) => {
    if (ev.selection) {
      const [mouseX0, mouseX1] = ev.selection as [number, number]
      setViewXScale(() =>
        xScale.copy().domain([xScale.invert(mouseX0), xScale.invert(mouseX1)])
      )
      setMouseState(undefined)
    } else {
      setViewXScale(undefined)
      setMouseState(undefined)
    }
  })

  const onMouseOver = useEvent((ev: React.PointerEvent) => {
    if (ev.pointerType === 'mouse') {
      const [mouseX, mouseY] = pointer(ev)
      const queryX = xScale.invert(mouseX)
      const item = data[xBisector.left(data, queryX) - 1]
      if (item == null) {
        // this can happen if you are on the very left or right edge of the chart,
        // so your queryX is out of bounds
        return
      }
      const p = { x: queryX, y: item.y, datum: item.datum }
      setMouseState({ top: mouseY - 10, left: mouseX + 60, p })
    }
  })

  const onMouseLeave = useEvent(() => {
    setMouseState(undefined)
  })

  return (
    <div className="relative">
      {mouseState && Tooltip && (
        <TooltipContainer className="text-sm" {...mouseState}>
          <Tooltip xScale={xScale} {...mouseState.p} />
        </TooltipContainer>
      )}
      <SVGChart
        w={w}
        h={h}
        xAxis={xAxis}
        yAxis={yAxis}
        onSelect={onSelect}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
      >
        <AreaWithTopStroke
          color={color}
          data={data}
          px={px}
          py0={py0}
          py1={py1}
          curve={curveLinear}
        />
      </SVGChart>
    </div>
  )
}

export type SingleValueDistributionTooltipProps<T = unknown> =
  DistributionPoint<T> & {
    xScale: React.ComponentProps<
      typeof SingleValueDistributionChart<T>
    >['xScale']
  }

export const MultiValueHistoryChart = <T,>(props: {
  data: MultiPoint<T>[]
  w: number
  h: number
  colors: readonly string[]
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  Tooltip?: TooltipContent<MultiValueHistoryTooltipProps<T>>
  pct?: boolean
}) => {
  const { colors, data, yScale, w, h, Tooltip, pct } = props

  const [viewXScale, setViewXScale] = useState<ScaleTime<number, number>>()
  const [mouseState, setMouseState] = useState<PositionValue<MultiPoint<T>>>()
  const xScale = viewXScale ?? props.xScale

  type SP = SeriesPoint<MultiPoint<T>>
  const px = useCallback((p: SP) => xScale(p.data.x), [xScale])
  const py0 = useCallback((p: SP) => yScale(p[0]), [yScale])
  const py1 = useCallback((p: SP) => yScale(p[1]), [yScale])
  const xBisector = bisector((p: MultiPoint<T>) => p.x)

  const { xAxis, yAxis } = useMemo(() => {
    const [min, max] = yScale.domain()
    const pctTickValues = getTickValues(min, max, h < 200 ? 3 : 5)
    const xAxis = axisBottom<Date>(xScale).ticks(w / 100)
    const yAxis = pct
      ? axisLeft<number>(yScale).tickValues(pctTickValues).tickFormat(formatPct)
      : axisLeft<number>(yScale)
    return { xAxis, yAxis }
  }, [w, h, pct, xScale, yScale])

  const series = useMemo(() => {
    const d3Stack = stack<MultiPoint<T>, number>()
      .keys(range(0, Math.max(...data.map(({ y }) => y.length))))
      .value(({ y }, o) => y[o])
      .order(stackOrderReverse)
    return d3Stack(data)
  }, [data])

  const onSelect = useEvent((ev: D3BrushEvent<MultiPoint<T>>) => {
    if (ev.selection) {
      const [mouseX0, mouseX1] = ev.selection as [number, number]
      setViewXScale(() =>
        xScale.copy().domain([xScale.invert(mouseX0), xScale.invert(mouseX1)])
      )
      setMouseState(undefined)
    } else {
      setViewXScale(undefined)
      setMouseState(undefined)
    }
  })

  const onMouseOver = useEvent((ev: React.PointerEvent) => {
    if (ev.pointerType === 'mouse') {
      const [mouseX, mouseY] = pointer(ev)
      const queryX = xScale.invert(mouseX)
      const item = data[xBisector.left(data, queryX) - 1]
      if (item == null) {
        // this can happen if you are on the very left or right edge of the chart,
        // so your queryX is out of bounds
        return
      }
      const p = { x: queryX, y: item.y, datum: item.datum }
      setMouseState({ top: mouseY - 10, left: mouseX + 60, p })
    }
  })

  const onMouseLeave = useEvent(() => {
    setMouseState(undefined)
  })

  return (
    <div className="relative">
      {mouseState && Tooltip && (
        <TooltipContainer top={mouseState.top} left={mouseState.left}>
          <Tooltip xScale={xScale} {...mouseState.p} />
        </TooltipContainer>
      )}
      <SVGChart
        w={w}
        h={h}
        xAxis={xAxis}
        yAxis={yAxis}
        onSelect={onSelect}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
      >
        {series.map((s, i) => (
          <AreaPath
            key={i}
            data={s}
            px={px}
            py0={py0}
            py1={py1}
            curve={curveStepAfter}
            fill={colors[i]}
          />
        ))}
      </SVGChart>
    </div>
  )
}

export type MultiValueHistoryTooltipProps<T = unknown> = MultiPoint<T> & {
  xScale: React.ComponentProps<typeof MultiValueHistoryChart<T>>['xScale']
}

export const SingleValueHistoryChart = <T,>(props: {
  data: HistoryPoint<T>[]
  w: number
  h: number
  color: string
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  Tooltip?: TooltipContent<SingleValueHistoryTooltipProps<T>>
  pct?: boolean
}) => {
  const { color, data, pct, yScale, w, h, Tooltip } = props

  const [viewXScale, setViewXScale] = useState<ScaleTime<number, number>>()
  const [mouseState, setMouseState] = useState<PositionValue<HistoryPoint<T>>>()
  const xScale = viewXScale ?? props.xScale

  const px = useCallback((p: HistoryPoint<T>) => xScale(p.x), [xScale])
  const py0 = yScale(yScale.domain()[0])
  const py1 = useCallback((p: HistoryPoint<T>) => yScale(p.y), [yScale])
  const xBisector = bisector((p: HistoryPoint<T>) => p.x)

  const { xAxis, yAxis } = useMemo(() => {
    const [min, max] = yScale.domain()
    const pctTickValues = getTickValues(min, max, h < 200 ? 3 : 5)
    const xAxis = axisBottom<Date>(xScale).ticks(w / 100)
    const yAxis = pct
      ? axisLeft<number>(yScale).tickValues(pctTickValues).tickFormat(formatPct)
      : axisLeft<number>(yScale)
    return { xAxis, yAxis }
  }, [w, h, pct, xScale, yScale])

  const onSelect = useEvent((ev: D3BrushEvent<HistoryPoint<T>>) => {
    if (ev.selection) {
      const [mouseX0, mouseX1] = ev.selection as [number, number]
      setViewXScale(() =>
        xScale.copy().domain([xScale.invert(mouseX0), xScale.invert(mouseX1)])
      )
      setMouseState(undefined)
    } else {
      setViewXScale(undefined)
      setMouseState(undefined)
    }
  })

  const onMouseOver = useEvent((ev: React.PointerEvent) => {
    if (ev.pointerType === 'mouse') {
      const [mouseX, mouseY] = pointer(ev)
      const queryX = xScale.invert(mouseX)
      const item = data[xBisector.left(data, queryX) - 1]
      if (item == null) {
        // this can happen if you are on the very left or right edge of the chart,
        // so your queryX is out of bounds
        return
      }
      const p = { x: queryX, y: item.y, datum: item.datum }
      setMouseState({ top: mouseY - 10, left: mouseX + 60, p })
    }
  })

  const onMouseLeave = useEvent(() => {
    setMouseState(undefined)
  })

  return (
    <div className="relative">
      {mouseState && Tooltip && (
        <TooltipContainer top={mouseState.top} left={mouseState.left}>
          <Tooltip xScale={xScale} {...mouseState.p} />
        </TooltipContainer>
      )}
      <SVGChart
        w={w}
        h={h}
        xAxis={xAxis}
        yAxis={yAxis}
        onSelect={onSelect}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
      >
        <AreaWithTopStroke
          color={color}
          data={data}
          px={px}
          py0={py0}
          py1={py1}
          curve={curveStepAfter}
        />
      </SVGChart>
    </div>
  )
}

export type SingleValueHistoryTooltipProps<T = unknown> = HistoryPoint<T> & {
  xScale: React.ComponentProps<typeof SingleValueHistoryChart<T>>['xScale']
}
