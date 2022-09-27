import { useRef, useCallback } from 'react'
import {
  axisBottom,
  axisLeft,
  bisector,
  curveLinear,
  curveStepAfter,
  pointer,
  stack,
  ScaleTime,
  ScaleContinuousNumeric,
  SeriesPoint,
} from 'd3'
import { range } from 'lodash'
import dayjs from 'dayjs'

import { SVGChart, AreaPath, AreaWithTopStroke } from './helpers'
import { formatLargeNumber } from 'common/util/format'
import { useEvent } from 'web/hooks/use-event'

export type MultiPoint = readonly [Date, number[]] // [time, [ordered outcome probs]]
export type HistoryPoint = readonly [Date, number] // [time, number or percentage]
export type DistributionPoint = readonly [number, number] // [number, prob]

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
  if (d.add(1, 'minute').isAfter(now) && d.subtract(1, 'minute').isBefore(now))
    return 'Now'
  if (d.isSame(now, 'day')) {
    return '[Today]'
  } else if (d.add(1, 'day').isSame(now, 'day')) {
    return '[Yesterday]'
  } else {
    let format = 'MMM D'
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

export const SingleValueDistributionChart = (props: {
  data: DistributionPoint[]
  w: number
  h: number
  color: string
  xScale: ScaleContinuousNumeric<number, number>
  yScale: ScaleContinuousNumeric<number, number>
}) => {
  const { color, data, xScale, yScale, w, h } = props
  const tooltipRef = useRef<HTMLDivElement>(null)

  const px = useCallback((p: DistributionPoint) => xScale(p[0]), [xScale])
  const py0 = yScale(0)
  const py1 = useCallback((p: DistributionPoint) => yScale(p[1]), [yScale])

  const formatX = (n: number) => formatLargeNumber(n)
  const formatY = (n: number) => formatPct(n, 2)

  const xAxis = axisBottom<number>(xScale).tickFormat(formatX)
  const yAxis = axisLeft<number>(yScale).tickFormat(formatY)

  const xBisector = bisector((p: DistributionPoint) => p[0])
  const onMouseOver = useEvent((event: React.PointerEvent) => {
    const tt = tooltipRef.current
    if (tt != null) {
      const [mouseX, mouseY] = pointer(event)
      const queryX = xScale.invert(mouseX)
      const [_x, y] = data[xBisector.center(data, queryX)]
      tt.innerHTML = `<strong>${formatY(y)}</strong> ${formatX(queryX)}`
      tt.style.display = 'block'
      tt.style.top = mouseY - 10 + 'px'
      tt.style.left = mouseX + 20 + 'px'
    }
  })

  const onMouseLeave = useEvent(() => {
    const tt = tooltipRef.current
    if (tt != null) {
      tt.style.display = 'none'
    }
  })

  return (
    <div className="relative">
      <div
        ref={tooltipRef}
        style={{ display: 'none' }}
        className="pointer-events-none absolute z-10 whitespace-pre rounded border-2 border-black bg-slate-600/75 p-2 text-white"
      />
      <SVGChart
        w={w}
        h={h}
        xAxis={xAxis}
        yAxis={yAxis}
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
  const { colors, data, xScale, yScale, labels, w, h, pct } = props
  const tooltipRef = useRef<HTMLDivElement>(null)

  const px = useCallback(
    (p: SeriesPoint<MultiPoint>) => xScale(p.data[0]),
    [xScale]
  )
  const py0 = useCallback(
    (p: SeriesPoint<MultiPoint>) => yScale(p[0]),
    [yScale]
  )
  const py1 = useCallback(
    (p: SeriesPoint<MultiPoint>) => yScale(p[1]),
    [yScale]
  )

  const [xStart, xEnd] = xScale.domain()
  const fmtX = getFormatterForDateRange(xStart, xEnd)
  const fmtY = (n: number) => (pct ? formatPct(n, 0) : formatLargeNumber(n))

  const [min, max] = yScale.domain()
  const tickValues = getTickValues(min, max, h < 200 ? 3 : 5)

  const xAxis = axisBottom<Date>(xScale).tickFormat(fmtX)
  const yAxis = axisLeft<number>(yScale).tickValues(tickValues).tickFormat(fmtY)

  const d3Stack = stack<MultiPoint, number>()
    .keys(range(0, labels.length))
    .value(([_date, probs], o) => probs[o])

  return (
    <div className="relative">
      <div
        ref={tooltipRef}
        style={{ display: 'none' }}
        className="pointer-events-none absolute z-10 whitespace-pre rounded border-2 border-black bg-slate-600/75 p-2 text-white"
      />
      <SVGChart w={w} h={h} xAxis={xAxis} yAxis={yAxis}>
        {d3Stack(data).map((s, i) => (
          <AreaPath
            key={s.key}
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
  xScale: d3.ScaleTime<number, number>
  yScale: d3.ScaleContinuousNumeric<number, number>
  pct?: boolean
}) => {
  const { color, data, xScale, yScale, pct, w, h } = props
  const tooltipRef = useRef<HTMLDivElement>(null)

  const px = useCallback((p: HistoryPoint) => xScale(p[0]), [xScale])
  const py0 = yScale(0)
  const py1 = useCallback((p: HistoryPoint) => yScale(p[1]), [yScale])

  const [start, end] = xScale.domain()
  const formatX = getFormatterForDateRange(start, end)
  const formatY = (n: number) => (pct ? formatPct(n, 0) : formatLargeNumber(n))

  const [min, max] = yScale.domain()
  const tickValues = getTickValues(min, max, h < 200 ? 3 : 5)

  const xAxis = axisBottom<Date>(xScale).tickFormat(formatX)
  const yAxis = axisLeft<number>(yScale)
    .tickValues(tickValues)
    .tickFormat(formatY)

  const xBisector = bisector((p: HistoryPoint) => p[0])
  const onMouseOver = useEvent((event: React.PointerEvent) => {
    const tt = tooltipRef.current
    if (tt != null) {
      const [mouseX, mouseY] = pointer(event)
      const queryX = xScale.invert(mouseX)
      const [_x, y] = data[xBisector.center(data, queryX)]
      tt.innerHTML = `<strong>${formatY(y)}</strong> ${formatX(queryX)}`
      tt.style.display = 'block'
      tt.style.top = mouseY - 10 + 'px'
      tt.style.left = mouseX + 20 + 'px'
    }
  })

  const onMouseLeave = useEvent(() => {
    const tt = tooltipRef.current
    if (tt != null) {
      tt.style.display = 'none'
    }
  })

  return (
    <div className="relative">
      <div
        ref={tooltipRef}
        style={{ display: 'none' }}
        className="pointer-events-none absolute z-10 whitespace-pre rounded border-2 border-black bg-slate-600/75 p-2 text-white"
      />
      <SVGChart
        w={w}
        h={h}
        xAxis={xAxis}
        yAxis={yAxis}
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
