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
import { range, sortBy } from 'lodash'
import dayjs from 'dayjs'

import {
  SVGChart,
  AreaPath,
  AreaWithTopStroke,
  ChartTooltip,
  TooltipPosition,
} from './helpers'
import { formatLargeNumber } from 'common/util/format'
import { useEvent } from 'web/hooks/use-event'
import { Row } from 'web/components/layout/row'

export type MultiPoint = readonly [Date, number[]] // [time, [ordered outcome probs]]
export type HistoryPoint = readonly [Date, number] // [time, number or percentage]
export type DistributionPoint = readonly [number, number] // [outcome amount, prob]
export type PositionValue<P> = TooltipPosition & { p: P }

const formatPct = (n: number, digits?: number) => {
  return `${(n * 100).toFixed(digits ?? 0)}%`
}

const formatDate = (
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

const getFormatterForDateRange = (start: Date, end: Date) => {
  const opts = {
    includeYear: !dayjs(start).isSame(end, 'year'),
    includeHour: dayjs(start).add(8, 'day').isAfter(end),
    includeMinute: dayjs(end).diff(start, 'hours') < 2,
  }
  return (d: Date) => formatDate(d, opts)
}

const getTickValues = (min: number, max: number, n: number) => {
  const step = (max - min) / (n - 1)
  return [min, ...range(1, n - 1).map((i) => min + step * i), max]
}

type LegendItem = { color: string; label: string; value?: string }

const Legend = (props: { className?: string; items: LegendItem[] }) => {
  const { items, className } = props
  return (
    <ol className={className}>
      {items.map((item) => (
        <li key={item.label} className="flex flex-row justify-between">
          <Row className="mr-2 items-center overflow-hidden">
            <span
              className="mr-2 h-4 w-4 shrink-0"
              style={{ backgroundColor: item.color }}
            ></span>
            <span className="overflow-hidden text-ellipsis">{item.label}</span>
          </Row>
          {item.value}
        </li>
      ))}
    </ol>
  )
}

export const SingleValueDistributionChart = (props: {
  data: DistributionPoint[]
  w: number
  h: number
  color: string
  xScale: ScaleContinuousNumeric<number, number>
  yScale: ScaleContinuousNumeric<number, number>
}) => {
  const { color, data, yScale, w, h } = props

  // note that we have to type this funkily in order to succesfully store
  // a function inside of useState
  const [viewXScale, setViewXScale] =
    useState<ScaleContinuousNumeric<number, number>>()
  const [mouseState, setMouseState] =
    useState<PositionValue<DistributionPoint>>()
  const xScale = viewXScale ?? props.xScale

  const px = useCallback((p: DistributionPoint) => xScale(p[0]), [xScale])
  const py0 = yScale(yScale.domain()[0])
  const py1 = useCallback((p: DistributionPoint) => yScale(p[1]), [yScale])
  const xBisector = bisector((p: DistributionPoint) => p[0])

  const { fmtX, fmtY, xAxis, yAxis } = useMemo(() => {
    const fmtX = (n: number) => formatLargeNumber(n)
    const fmtY = (n: number) => formatPct(n, 2)
    const xAxis = axisBottom<number>(xScale).ticks(w / 100)
    const yAxis = axisLeft<number>(yScale).tickFormat(fmtY)
    return { fmtX, fmtY, xAxis, yAxis }
  }, [w, xScale, yScale])

  const onSelect = useEvent((ev: D3BrushEvent<DistributionPoint>) => {
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
      const [_x, y] = item
      setMouseState({ top: mouseY - 10, left: mouseX + 60, p: [queryX, y] })
    }
  })

  const onMouseLeave = useEvent(() => {
    setMouseState(undefined)
  })

  return (
    <div className="relative">
      {mouseState && (
        <ChartTooltip className="text-sm" {...mouseState}>
          <strong>{fmtY(mouseState.p[1])}</strong> {fmtX(mouseState.p[0])}
        </ChartTooltip>
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

export const MultiValueHistoryChart = (props: {
  data: MultiPoint[]
  w: number
  h: number
  labels: readonly string[]
  colors: readonly string[]
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  pct?: boolean
}) => {
  const { colors, data, yScale, labels, w, h, pct } = props

  const [viewXScale, setViewXScale] = useState<ScaleTime<number, number>>()
  const [mouseState, setMouseState] = useState<PositionValue<MultiPoint>>()
  const xScale = viewXScale ?? props.xScale

  type SP = SeriesPoint<MultiPoint>
  const px = useCallback((p: SP) => xScale(p.data[0]), [xScale])
  const py0 = useCallback((p: SP) => yScale(p[0]), [yScale])
  const py1 = useCallback((p: SP) => yScale(p[1]), [yScale])
  const xBisector = bisector((p: MultiPoint) => p[0])

  const { fmtX, fmtY, xAxis, yAxis } = useMemo(() => {
    const [start, end] = xScale.domain()
    const fmtX = getFormatterForDateRange(start, end)
    const fmtY = (n: number) => (pct ? formatPct(n, 0) : formatLargeNumber(n))

    const [min, max] = yScale.domain()
    const pctTickValues = getTickValues(min, max, h < 200 ? 3 : 5)
    const xAxis = axisBottom<Date>(xScale).ticks(w / 100)
    const yAxis = pct
      ? axisLeft<number>(yScale).tickValues(pctTickValues).tickFormat(fmtY)
      : axisLeft<number>(yScale)

    return { fmtX, fmtY, xAxis, yAxis }
  }, [w, h, pct, xScale, yScale])

  const series = useMemo(() => {
    const d3Stack = stack<MultiPoint, number>()
      .keys(range(0, labels.length))
      .value(([_date, probs], o) => probs[o])
      .order(stackOrderReverse)
    return d3Stack(data)
  }, [data, labels.length])

  const onSelect = useEvent((ev: D3BrushEvent<MultiPoint>) => {
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
      const [_x, ys] = item
      setMouseState({ top: mouseY - 10, left: mouseX + 60, p: [queryX, ys] })
    }
  })

  const onMouseLeave = useEvent(() => {
    setMouseState(undefined)
  })

  const mouseProbs = mouseState?.p[1] ?? []
  const legendItems = sortBy(
    mouseProbs.map((p, i) => ({
      color: colors[i],
      label: labels[i],
      value: fmtY(p),
      p,
    })),
    (item) => -item.p
  ).slice(0, 10)

  return (
    <div className="relative">
      {mouseState && (
        <ChartTooltip {...mouseState}>
          {fmtX(mouseState.p[0])}
          <Legend className="max-w-xs text-sm" items={legendItems} />
        </ChartTooltip>
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

export const SingleValueHistoryChart = (props: {
  data: HistoryPoint[]
  w: number
  h: number
  color: string
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  pct?: boolean
}) => {
  const { color, data, pct, yScale, w, h } = props

  const [viewXScale, setViewXScale] = useState<ScaleTime<number, number>>()
  const [mouseState, setMouseState] = useState<PositionValue<HistoryPoint>>()
  const xScale = viewXScale ?? props.xScale

  const px = useCallback((p: HistoryPoint) => xScale(p[0]), [xScale])
  const py0 = yScale(yScale.domain()[0])
  const py1 = useCallback((p: HistoryPoint) => yScale(p[1]), [yScale])
  const xBisector = bisector((p: HistoryPoint) => p[0])

  const { fmtX, fmtY, xAxis, yAxis } = useMemo(() => {
    const [start, end] = xScale.domain()
    const fmtX = getFormatterForDateRange(start, end)
    const fmtY = (n: number) => (pct ? formatPct(n, 0) : formatLargeNumber(n))

    const [min, max] = yScale.domain()
    const pctTickValues = getTickValues(min, max, h < 200 ? 3 : 5)
    const xAxis = axisBottom<Date>(xScale).ticks(w / 100)
    const yAxis = pct
      ? axisLeft<number>(yScale).tickValues(pctTickValues).tickFormat(fmtY)
      : axisLeft<number>(yScale)
    return { fmtX, fmtY, xAxis, yAxis }
  }, [w, h, pct, xScale, yScale])

  const onSelect = useEvent((ev: D3BrushEvent<HistoryPoint>) => {
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
      const [_x, y] = item
      setMouseState({ top: mouseY - 10, left: mouseX + 60, p: [queryX, y] })
    }
  })

  const onMouseLeave = useEvent(() => {
    setMouseState(undefined)
  })

  return (
    <div className="relative">
      {mouseState && (
        <ChartTooltip className="text-sm" {...mouseState}>
          <strong>{fmtY(mouseState.p[1])}</strong> {fmtX(mouseState.p[0])}
        </ChartTooltip>
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
