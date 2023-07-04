import { bisector, extent } from 'd3-array'
import { axisBottom, axisRight } from 'd3-axis'
import { ScaleContinuousNumeric, ScaleTime } from 'd3-scale'
import { D3ZoomEvent } from 'd3-zoom'
import {
  CurveFactory,
  SeriesPoint,
  curveLinear,
  curveStepAfter,
  curveStepBefore,
  stack,
  stackOrderReverse,
} from 'd3-shape'
import { range } from 'lodash'
import { useCallback, useId, useMemo, useState } from 'react'

import {
  AxisConstraints,
  DistributionPoint,
  HistoryPoint,
  MultiPoint,
  Point,
  ValueKind,
  viewScale,
} from 'common/chart'
import { formatMoneyNumber } from 'common/util/format'
import { useEvent } from 'web/hooks/use-event'
import {
  AreaPath,
  AreaWithTopStroke,
  SVGChart,
  SliceMarker,
  TooltipComponent,
  TooltipParams,
  computeColorStops,
  formatPct,
} from './helpers'
import { roundToNearestFive } from 'web/lib/util/roundToNearestFive'

const Y_AXIS_CONSTRAINTS: Record<ValueKind, AxisConstraints> = {
  percent: { min: 0, max: 1, minExtent: 0.04 },
  Ṁ: { minExtent: 10 },
  amount: { minExtent: 0.04 },
}

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
    if (x1 == x0) {
      return y0
    } else {
      const p = (x - x0) / (x1 - x0)
      return y0 * (1 - p) + y1 * p
    }
  } else if (curve === curveStepAfter) {
    return y0
  } else if (curve === curveStepBefore) {
    return y1
  } else {
    return 0
  }
}

const constrainExtent = (
  extent: [number, number],
  constraints: AxisConstraints
) => {
  // first clamp the extent to our min and max
  const min = constraints.min ?? -Infinity
  const max = constraints.max ?? Infinity
  const minExtent = constraints.minExtent ?? 0
  const start = Math.max(extent[0], min)
  const end = Math.min(extent[1], max)
  const size = end - start
  if (size >= minExtent) {
    return [start, end]
  } else {
    // compute how much padding we need to get to the min extent
    const halfPad = Math.max(0, minExtent - size) / 2
    const paddedStart = start - halfPad
    const paddedEnd = end + halfPad
    // we would like to return [start - halfPad, end + halfPad], but if our padding
    // is making us go past the min and max, we need to readjust it to the other end
    if (paddedStart < min) {
      const underflow = min - paddedStart
      return [min, paddedEnd + underflow]
    } else if (paddedEnd > max) {
      const overflow = paddedEnd - max
      return [paddedStart - overflow, max]
    } else {
      return [paddedStart, paddedEnd]
    }
  }
}

const getTickValues = (
  min: number,
  max: number,
  n: number,
  negativeThreshold?: number
) => {
  let step = (max - min) / (n - 1)
  let theMin = min
  let theMax = max
  if (step > 10) {
    theMin = roundToNearestFive(min)
    theMax = roundToNearestFive(max)
    step = (theMax - theMin) / (n - 1)
  }
  const defaultRange = [
    theMin,
    ...range(1, n - 1).map((i) => theMin + step * i),
    theMax,
  ]
  if (negativeThreshold) {
    return defaultRange
      .filter((n) => Math.abs(negativeThreshold - n) > Math.max(step / 4, 1))
      .concat(negativeThreshold)
      .sort((a, b) => a - b)
  }
  return defaultRange
}

const dataAtTimeSelector = <Y, P extends Point<number, Y>>(
  data: P[],
  xScale: ScaleTime<number, number>
) => {
  const bisect = bisector((p: P) => p.x)
  return (posX: number) => {
    const x = xScale.invert(posX)
    const i = bisect.left(data, x)
    const prev = data[i - 1] as P | undefined
    const next = data[i] as P | undefined
    const nearest = data[bisect.center(data, x)]
    return { prev, next, nearest, x: posX }
  }
}

export const DistributionChart = <P extends DistributionPoint>(props: {
  data: P[]
  w: number
  h: number
  color: string
  xScale: ScaleContinuousNumeric<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  curve?: CurveFactory
}) => {
  const { data, w, h, color, yScale, curve } = props

  const [viewXScale, setViewXScale] =
    useState<ScaleContinuousNumeric<number, number>>()
  const xScale = viewXScale ?? props.xScale

  const px = useCallback((p: P) => xScale(p.x), [xScale])
  const py0 = yScale(yScale.domain()[0])
  const py1 = useCallback((p: P) => yScale(p.y), [yScale])

  const { xAxis, yAxis } = useMemo(() => {
    const xAxis = axisBottom<number>(xScale).ticks(w / 100)
    const yAxis = axisRight<number>(yScale).tickFormat((n) => formatPct(n))
    return { xAxis, yAxis }
  }, [w, xScale, yScale])

  const onZoom = useEvent((ev: D3ZoomEvent<SVGElement, P> | null) => {
    if (ev?.transform) {
      setViewXScale(() => ev.transform.rescaleX(props.xScale))
    } else {
      setViewXScale(undefined)
    }
  })

  return (
    <SVGChart w={w} h={h} xAxis={xAxis} yAxis={yAxis} onZoom={onZoom}>
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
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  yKind?: ValueKind
  curve?: CurveFactory
  onMouseOver?: (p: P | undefined) => void
  Tooltip?: TooltipComponent<Date, P>
}) => {
  const { data, w, h, colors, yScale, yKind, curve, Tooltip } = props

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
        ? axisRight<number>(yScale)
            .tickValues(pctTickValues)
            .tickFormat((n) => formatPct(n))
        : yKind === 'Ṁ'
        ? axisRight<number>(yScale)
            .ticks(nTicks)
            .tickFormat((n) => formatMoneyNumber(n))
        : axisRight<number>(yScale).ticks(nTicks)
    return { xAxis, yAxis }
  }, [w, h, yKind, xScale, yScale])

  const series = useMemo(() => {
    const d3Stack = stack<P, number>()
      .keys(range(0, Math.max(...data.map(({ y }) => y.length))))
      .value(({ y }, k) => y[k])
      .order(stackOrderReverse)
    return d3Stack(data)
  }, [data])

  const selector = dataAtTimeSelector(data, xScale)
  const onMouseOver = useEvent((mouseX: number, mouseY: number) => {
    const p = selector(mouseX)
    props.onMouseOver?.(p.prev)
    if (p.prev) {
      setTTParams({ ...p, x: mouseX, y: mouseY })
    } else {
      setTTParams(undefined)
    }
  })

  const onMouseLeave = useEvent(() => {
    props.onMouseOver?.(undefined)
    setTTParams(undefined)
  })

  const onZoom = useEvent((ev: D3ZoomEvent<SVGElement, unknown> | null) => {
    if (ev?.transform) {
      setViewXScale(() => ev.transform.rescaleX(props.xScale))
    } else {
      setViewXScale(undefined)
    }
  })

  return (
    <SVGChart
      w={w}
      h={h}
      xAxis={xAxis}
      yAxis={yAxis}
      ttParams={ttParams}
      onZoom={onZoom}
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

export const ControllableSingleValueHistoryChart = <
  P extends HistoryPoint
>(props: {
  data: P[]
  w: number
  h: number
  color: string | ((p: P) => string)
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  viewScaleProps: viewScale
  yKind?: ValueKind
  curve?: CurveFactory
  onMouseOver?: (p: P | undefined) => void
  Tooltip?: TooltipComponent<Date, P>
  noAxes?: boolean
  pct?: boolean
  negativeThreshold?: number
}) => {
  const { data, w, h, color, Tooltip, noAxes, negativeThreshold } = props
  const { viewXScale, setViewXScale, viewYScale, setViewYScale } =
    props.viewScaleProps
  const yKind = props.yKind ?? 'amount'
  const curve = props.curve ?? curveLinear

  const [mouse, setMouse] = useState<TooltipParams<P> & SliceExtent>()
  const xScale = viewXScale ?? props.xScale
  const yScale = viewYScale ?? props.yScale

  const px = useCallback((p: P) => xScale(p.x), [xScale])
  const py0 = yScale(0)
  const py1 = useCallback((p: P) => yScale(p.y), [yScale])
  const { xAxis, yAxis } = useMemo(() => {
    const [min, max] = yScale.domain()
    const nTicks = noAxes ? 0 : h < 200 ? 3 : 5
    const customTickValues = noAxes
      ? []
      : getTickValues(min, max, nTicks, negativeThreshold)
    const xAxis = axisBottom<Date>(xScale).ticks(noAxes ? 0 : w / 100)
    const yAxis =
      yKind === 'percent'
        ? axisRight<number>(yScale)
            .tickValues(customTickValues)
            .tickFormat((n) => formatPct(n))
        : yKind === 'Ṁ'
        ? negativeThreshold
          ? axisRight<number>(yScale)
              .tickValues(customTickValues)
              .tickFormat((n) => formatMoneyNumber(n))
          : axisRight<number>(yScale)
              .ticks(nTicks)
              .tickFormat((n) => formatMoneyNumber(n))
        : axisRight<number>(yScale).ticks(nTicks)
    return { xAxis, yAxis }
  }, [w, h, yKind, xScale, yScale, noAxes])

  const selector = dataAtTimeSelector(data, xScale)
  const onMouseOver = useEvent((mouseX: number) => {
    const p = selector(mouseX)
    props.onMouseOver?.(p.prev)
    if (p.prev) {
      const x0 = xScale(p.prev.x)
      const x1 = p.next ? xScale(p.next.x) : x0
      const y0 = yScale(p.prev.y)
      const y1 = p.next ? yScale(p.next.y) : y0
      const markerY = interpolateY(curve, mouseX, x0, x1, y0, y1)
      setMouse({ ...p, x: mouseX, y: markerY, y0: py0, y1: markerY })
    } else {
      setMouse(undefined)
    }
  })

  const onMouseLeave = useEvent(() => {
    props.onMouseOver?.(undefined)
    setMouse(undefined)
  })

  const onZoom = useEvent((ev: D3ZoomEvent<SVGElement, P> | null) => {
    if (ev?.transform) {
      const newXScale = ev.transform.rescaleX(props.xScale)
      setViewXScale(() => newXScale)
      const [xMin, xMax] = newXScale.domain()

      const bisect = bisector((p: P) => p.x)
      const iMin = bisect.right(data, xMin)
      const iMax = bisect.right(data, xMax)

      // don't zoom axis if they selected an area with only one value
      if (iMin != iMax) {
        const visibleYs = range(iMin - 1, iMax).map((i) => data[i]?.y)
        const [yMin, yMax] = extent(visibleYs) as [number, number]
        // try to add extra space on top and bottom before constraining
        const padding = (yMax - yMin) * 0.1
        const domain = constrainExtent(
          [yMin - padding, yMax + padding],
          Y_AXIS_CONSTRAINTS[yKind]
        )
        setViewYScale(() => yScale.copy().domain(domain).nice())
      }
    } else {
      setViewXScale(undefined)
      setViewYScale(undefined)
    }
  })

  const gradientId = useId()
  const stops = useMemo(
    () =>
      typeof color !== 'string' ? computeColorStops(data, color, px) : null,
    [color, data, px]
  )

  return (
    <SVGChart
      w={w}
      h={h}
      xAxis={xAxis}
      yAxis={yAxis}
      ttParams={mouse}
      onZoom={onZoom}
      onMouseOver={onMouseOver}
      onMouseLeave={onMouseLeave}
      Tooltip={Tooltip}
      negativeThreshold={negativeThreshold}
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

export const SingleValueHistoryChart = <P extends HistoryPoint>(
  props: Omit<
    Parameters<typeof ControllableSingleValueHistoryChart<P>>[0],
    'viewScaleProps'
  >
) => {
  const viewScaleProps = useSingleValueHistoryChartViewScale()

  return (
    <ControllableSingleValueHistoryChart
      {...props}
      viewScaleProps={viewScaleProps}
    />
  )
}

export const useSingleValueHistoryChartViewScale = () => {
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
