import { bisector } from 'd3-array'
import { axisBottom, axisRight } from 'd3-axis'
import { ScaleContinuousNumeric, ScaleTime } from 'd3-scale'
import {
  CurveFactory,
  curveLinear,
  curveStepAfter,
  curveStepBefore,
} from 'd3-shape'
import { range, mapValues, last } from 'lodash'
import {
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react'

import {
  DistributionPoint,
  HistoryPoint,
  Point,
  ValueKind,
  compressPoints,
} from 'common/chart'
import { formatMoneyNumber } from 'common/util/format'
import { useEvent } from 'web/hooks/use-event'
import {
  AreaPath,
  AreaWithTopStroke,
  LinePath,
  SVGChart,
  SliceMarker,
  TooltipProps,
  ZoomParams,
  formatPct,
  PointerMode,
} from './helpers'
import { roundToNearestFive } from 'web/lib/util/roundToNearestFive'
import { ZoomSlider } from './zoom-slider'
import clsx from 'clsx'
import {
  AnnotateChartModal,
  ChartAnnotationModal,
} from 'web/components/annotate-chart'
import {
  ChartAnnotation,
  useChartAnnotations,
} from 'web/hooks/use-chart-annotations'

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

const getTickValues = (min: number, max: number, n: number) => {
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
  const { data, w, h, color, xScale, yScale, curve } = props

  const px = useCallback((p: P) => xScale(p.x), [xScale])
  const py0 = yScale(yScale.domain()[0])
  const py1 = useCallback((p: P) => yScale(p.y), [yScale])

  const { xAxis, yAxis } = useMemo(() => {
    const xAxis = axisBottom<number>(xScale).ticks(w / 100)
    const yAxis = axisRight<number>(yScale).tickFormat((n) => formatPct(n))
    return { xAxis, yAxis }
  }, [w, xScale, yScale])

  return (
    <SVGChart w={w} h={h} xAxis={xAxis} yAxis={yAxis}>
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

// multi line chart
export const MultiValueHistoryChart = <P extends HistoryPoint>(props: {
  data: { [id: string]: { points: P[]; color: string } }
  w: number
  h: number
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  zoomParams: ZoomParams
  showZoomer?: boolean
  yKind?: ValueKind
  curve?: CurveFactory
  hoveringId?: string
  Tooltip?: (props: TooltipProps<P> & { ans: string }) => ReactNode
  contractId?: string
}) => {
  const { data, contractId, w, h, yScale, zoomParams, showZoomer, Tooltip } =
    props

  useEffect(() => {
    if (props.xScale) {
      zoomParams?.setXScale(props.xScale)
    }
  }, [w])

  const xScale = zoomParams?.viewXScale ?? props.xScale

  const [ttParams, setTTParams] = useState<TooltipProps<P> & { ans: string }>()
  const curve = props.curve ?? curveStepAfter

  const px = useCallback((p: P) => xScale(p.x), [xScale])
  const py = useCallback((p: P) => yScale(p.y), [yScale])

  const { xAxis, yAxis } = useMemo(() => {
    const [min, max] = yScale.domain()
    const nTicks = h < 200 ? 3 : 5
    const pctTickValues = getTickValues(min, max, nTicks)
    const xAxis = axisBottom<Date>(xScale).ticks(w / 100)
    const yAxis = axisRight<number>(yScale)
      .tickValues(pctTickValues)
      .tickFormat((n) => formatPct(n))

    return { xAxis, yAxis }
  }, [w, h, xScale, yScale])

  const sortedLines = useMemo(
    () =>
      Object.entries(data)
        .map(([id, { points, color }]) => ({
          points,
          color,
          id,
        }))
        .sort((a, b) => {
          const endA = last(a.points)
          const endB = last(b.points)
          if (!endA) return -1
          if (!endB) return 1
          return endA.y - endB.y
        }),
    [data]
  )

  const selectors = mapValues(data, (data) =>
    dataAtTimeSelector(data.points, xScale)
  )
  const onMouseOver = useEvent((mouseX: number, mouseY: number) => {
    const valueY = yScale.invert(mouseY)

    const ps = sortedLines.map((data) => selectors[data.id](mouseX))

    let closestIdx = 0
    ps.forEach((p, i) => {
      const closePrev = ps[closestIdx].prev
      const closestDist = closePrev ? Math.abs(closePrev.y - valueY) : 1
      if (p.prev && p.next && Math.abs(p.prev.y - valueY) < closestDist) {
        closestIdx = i
      }
    })

    const p = ps[closestIdx]

    if (p?.prev) {
      setTTParams({
        ...p,
        ans: sortedLines[closestIdx].id,
        x: mouseX,
        y: yScale(p.prev.y),
      })
    } else {
      setTTParams(undefined)
    }
  })

  const onMouseLeave = useEvent(() => {
    setTTParams(undefined)
  })

  const hoveringId = props.hoveringId ?? ttParams?.ans

  return (
    <>
      <SVGChart
        w={w}
        h={h}
        xAxis={xAxis}
        yAxis={yAxis}
        ttParams={ttParams}
        zoomParams={zoomParams}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
        Tooltip={Tooltip}
        noGridlines
        className="group"
      >
        {sortedLines.map(({ id, points, color }) => (
          <g key={id}>
            <LinePath
              data={points}
              px={px}
              py={py}
              curve={curve}
              className={clsx(
                'transition-[stroke-width]',
                hoveringId && hoveringId !== id
                  ? 'stroke-1 opacity-50'
                  : 'stroke-2'
              )}
              stroke={color}
            />
          </g>
        ))}
        {/* hover effect put last so it shows on top */}
        {hoveringId && hoveringId in data && (
          <AreaPath
            data={data[hoveringId].points}
            px={px}
            py0={yScale(0)}
            py1={py}
            curve={curve}
            fill={data[hoveringId].color}
            opacity={0.5}
          />
        )}
        {ttParams && (
          <SliceMarker
            color="#5BCEFF"
            x={ttParams.x}
            y0={yScale(0)}
            y1={ttParams.y}
          />
        )}
      </SVGChart>
      {showZoomer && zoomParams && (
        <ZoomSlider zoomParams={zoomParams} className="relative top-4" />
      )}
    </>
  )
}

export const SingleValueHistoryChart = <P extends HistoryPoint>(props: {
  data: P[]
  w: number
  h: number
  color: string | [top: string, bottom: string]
  /** y value above which is top color, below which is bottom color */
  negativeThreshold?: number
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  zoomParams?: ZoomParams
  showZoomer?: boolean
  yKind?: ValueKind
  curve?: CurveFactory
  onMouseOver?: (p: P | undefined) => void
  Tooltip?: (props: TooltipProps<P>) => ReactNode
  pct?: boolean
  contractId?: string
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
  pointerMode?: PointerMode
}) => {
  const {
    contractId,
    data,
    w,
    h,
    color,
    Tooltip,
    negativeThreshold = 0,
    showZoomer,
    yScale,
    zoomParams,
    hoveredAnnotation,
    setHoveredAnnotation,
    pointerMode = 'zoom',
  } = props

  useEffect(() => {
    if (props.xScale) {
      zoomParams?.setXScale(props.xScale)
    }
  }, [w])

  const xScale = zoomParams?.viewXScale ?? props.xScale

  const yKind = props.yKind ?? 'amount'

  const [xMin, xMax] = xScale?.domain().map((d) => d.getTime()) ?? [
    data[0].x,
    data[data.length - 1].x,
  ]

  const { points, isCompressed } = useMemo(
    () => compressPoints(data, xMin, xMax),
    [data, xMin, xMax]
  )

  const curve = props.curve ?? isCompressed ? curveLinear : curveStepAfter

  const [mouse, setMouse] = useState<TooltipProps<P>>()

  const px = useCallback((p: P) => xScale(p.x), [xScale])
  const py0 = yScale(negativeThreshold)
  const py1 = useCallback((p: P) => yScale(p.y), [yScale])
  const { xAxis, yAxis } = useMemo(() => {
    const [min, max] = yScale.domain()
    const nTicks = h < 200 ? 3 : 5
    const customTickValues = getTickValues(min, max, nTicks)
    const xAxis = axisBottom<Date>(xScale).ticks(w / 100)
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
  }, [w, h, yKind, xScale, yScale])

  const selector = dataAtTimeSelector(points, xScale)
  const onMouseOver = useEvent((mouseX: number) => {
    setMouse(getMarkerPosition(mouseX, props.onMouseOver))
  })

  const getMarkerPosition = useEvent(
    (mouseX: number, onMouseOver?: (p: P | undefined) => void) => {
      const p = selector(mouseX) // Ensure the selector function is adapted to use the passed data
      onMouseOver?.(p.prev)
      if (p.prev) {
        const x0 = xScale(p.prev.x)
        const x1 = p.next ? xScale(p.next.x) : x0
        const y0 = yScale(p.prev.y)
        const y1 = p.next ? yScale(p.next.y) : y0
        const markerY = interpolateY(curve, mouseX, x0, x1, y0, y1)

        return { ...p, y: markerY }
      } else {
        return undefined
      }
    }
  )

  const onMouseLeave = useEvent(() => {
    props.onMouseOver?.(undefined)
    setMouse(undefined)
  })

  const [showChartAnnotationModal, setShowChartAnnotationModal] =
    useState<ChartAnnotation>()
  const [chartAnnotationTime, setChartAnnotationTime] = useState<
    number | undefined
  >()
  const onClick = useEvent((x: number, y: number) => {
    if (!xScale || !contractId) {
      console.log('no xScale and/or contractId')
      return
    }
    console.log('x', x)
    console.log('time at click', xScale.invert(x))
    if (pointerMode === 'annotate')
      setChartAnnotationTime(xScale.invert(x).valueOf())
    else if (pointerMode === 'examine') {
      const chartAnnotation = chartAnnotations?.find(
        (a) => a.id === hoveredAnnotation
      )
      setShowChartAnnotationModal(chartAnnotation)
    }
  })
  const gradientId = useId()
  const chartTheshold = yScale(negativeThreshold)
  const chartAnnotations = useChartAnnotations(contractId ?? '_')

  return (
    <>
      <SVGChart
        w={w}
        h={h}
        xAxis={xAxis}
        yAxis={yAxis}
        ttParams={mouse}
        zoomParams={zoomParams}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
        Tooltip={Tooltip}
        onClick={onClick}
        xScale={xScale}
        y0={py0}
        yAtX={(x: number) => getMarkerPosition(x)?.y ?? 0}
        chartAnnotations={chartAnnotations}
        hoveredAnnotation={hoveredAnnotation}
        onHoverAnnotation={setHoveredAnnotation}
        pointerMode={pointerMode}
      >
        {typeof color !== 'string' && (
          <defs>
            <linearGradient
              gradientUnits="userSpaceOnUse"
              id={gradientId}
              gradientTransform="rotate(90)"
            >
              <stop offset={0} stopColor={color[0]} />
              <stop offset={chartTheshold / w} stopColor={color[0]} />
              <stop offset={chartTheshold / w} stopColor={color[1]} />
              <stop offset={1} stopColor={color[1]} />
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
          <SliceMarker color="#5BCEFF" x={mouse.x} y0={py0} y1={mouse.y} />
        )}
      </SVGChart>
      {showZoomer && zoomParams && (
        <ZoomSlider
          zoomParams={zoomParams}
          color="light-green"
          className="relative top-4"
        />
      )}
      {chartAnnotationTime !== undefined &&
        contractId &&
        pointerMode === 'annotate' && (
          <AnnotateChartModal
            open={true}
            setOpen={(open) => {
              if (!open) setChartAnnotationTime(undefined)
            }}
            contractId={contractId}
            atTime={chartAnnotationTime}
          />
        )}
      {showChartAnnotationModal && (
        <ChartAnnotationModal
          open={true}
          setOpen={() => setShowChartAnnotationModal(undefined)}
          chartAnnotation={showChartAnnotationModal}
        />
      )}
    </>
  )
}
