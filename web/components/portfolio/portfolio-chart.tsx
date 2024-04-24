import { bisector } from 'd3-array'
import { axisBottom, axisRight } from 'd3-axis'
import { ScaleContinuousNumeric, ScaleTime } from 'd3-scale'
import {
  CurveFactory,
  curveLinear,
  curveStepAfter,
  curveStepBefore,
  line,
} from 'd3-shape'
import { last, mapValues, range } from 'lodash'
import {
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react'
import { DistributionPoint, HistoryPoint, Point, ValueKind } from 'common/chart'
import { formatMoneyNumber } from 'common/util/format'
import { useEvent } from 'web/hooks/use-event'
import {
  AreaPath,
  AreaWithTopStroke,
  formatPct,
  LinePath,
  PointerMode,
  SliceMarker,
  SVGChart,
  TooltipProps,
  ZoomParams,
} from '../charts/helpers'
import { roundToNearestFive } from 'web/lib/util/roundToNearestFive'
import { ZoomSlider } from '../charts/zoom-slider'
import clsx from 'clsx'
import {
  AnnotateChartModal,
  ReadChartAnnotationModal,
} from 'web/components/annotate-chart'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import {
  dataAtTimeSelector,
  dataAtXSelector,
  getTickValues,
} from '../charts/generic-charts'
import { PortfolioMetrics } from 'common/portfolio-metrics'

// multi line chart
export const PortfolioChart = <P extends HistoryPoint>(props: {
  data: Record<string, { points: P[]; color: string }>
  w: number
  h: number
  xScale: ScaleTime<number, number>
  yScale: ScaleContinuousNumeric<number, number>
  zoomParams?: ZoomParams
  showZoomer?: boolean
  yKind?: ValueKind
  curve?: CurveFactory
  hoveringId?: string
  Tooltip?: (props: TooltipProps<P> & { ans: string }) => ReactNode
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
  pointerMode?: PointerMode
}) => {
  const {
    data,
    w,
    h,
    yScale,
    zoomParams,
    showZoomer,
    Tooltip,
    pointerMode = 'zoom',
    hoveredAnnotation,
    setHoveredAnnotation,
    yKind,
  } = props

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
    const nTicks = h < 200 ? 3 : 5
    const xAxis = axisBottom<Date>(xScale).ticks(w / 100)
    const yAxis = axisRight<number>(yScale)
      .ticks(nTicks)
      .tickFormat((n) => formatMoneyNumber(n))
    return { xAxis, yAxis }
  }, [w, h, xScale, yScale])

  const selectors = mapValues(data, (data) =>
    dataAtXSelector(data.points, xScale)
  )
  const timeSelectors = mapValues(data, (data) =>
    dataAtTimeSelector(data.points)
  )
  // Accumulate y-values to stack lines
  const stackedData = useMemo(() => {
    const cumulativeData: Record<number, number> = {}

    // Go through each dataset
    return Object.entries(data).reduce<
      {
        points: P[]
        color: string
        id: string
      }[]
    >((acc, [id, { points, color }]) => {
      const stackedPoints = points.map((point) => {
        const cumulativeY = (cumulativeData[point.x] || 0) + point.y
        cumulativeData[point.x] = cumulativeY // Update cumulative sum for this x-value
        return { ...point, y: cumulativeY } // Return new point with updated y-value
      })

      acc.push({ id, points: stackedPoints, color })
      return acc
    }, [])
  }, [data])

  const getMarkerPosition = useEvent((mouseX: number, mouseY: number) => {
    const valueY = yScale.invert(mouseY)
    const ps = stackedData.map((data) => selectors[data.id](mouseX))
    let closestIdx = 0
    ps.forEach((p, i) => {
      const closePrev = ps[closestIdx].prev
      const closestDist = closePrev ? Math.abs(closePrev.y - valueY) : 1
      if (p.prev && p.next && Math.abs(p.prev.y - valueY) < closestDist) {
        closestIdx = i
      }
      console.log(
        closePrev,
        p.prev,
        p.next,
        closestDist,
        Math.abs(p.prev.y - valueY)
      )
    })
    const p = ps[closestIdx]
    if (p?.prev) {
      return {
        ...p,
        ans: stackedData[closestIdx].id,
        x: mouseX,
        y: yScale(p.prev.y),
      }
    } else {
      return undefined
    }
  })
  const onMouseOver = useEvent((mouseX: number, mouseY: number) => {
    setTTParams(getMarkerPosition(mouseX, mouseY))
  })

  const onMouseLeave = useEvent(() => {
    setTTParams(undefined)
  })

  const hoveringId = props.hoveringId ?? ttParams?.ans
  const getYValueByAnswerIdAndTime = (time: number, answerId: string) => {
    const selector = timeSelectors[answerId]
    if (!selector) return null
    const point = selector(time)
    return point ? yScale(point.nearest.y) : null
  }

  const hoverData = stackedData.find((data) => data.id == hoveringId)

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
        pointerMode={pointerMode}
        hoveredAnnotation={hoveredAnnotation}
        onHoverAnnotation={setHoveredAnnotation}
        y0={yScale(0)}
        xScale={xScale}
        yAtTime={(time, answerId) =>
          answerId ? getYValueByAnswerIdAndTime(time, answerId) ?? 1 : 1
        }
      >
        {stackedData.map(
          ({ id, points, color }) =>
            (!hoveringId || hoveringId !== id) && (
              <g key={id}>
                <LinePath
                  data={points}
                  px={px}
                  py={py}
                  curve={curve}
                  className={clsx(
                    ' stroke-canvas-0 transition-[stroke-width]',
                    hoveringId && hoveringId !== id
                      ? 'stroke-[0px] opacity-50'
                      : 'stroke-[4px]'
                  )}
                />
                <LinePath
                  data={points}
                  px={px}
                  py={py}
                  curve={curve}
                  className={clsx(
                    ' transition-[stroke-width]',
                    hoveringId && hoveringId !== id
                      ? 'stroke-1 opacity-50'
                      : 'stroke-2'
                  )}
                  stroke={color}
                />
              </g>
            )
        )}
        {/* show hovering line on top */}
        {hoveringId && hoverData && (
          <g key={`${hoveringId}-front`}>
            <LinePath
              data={hoverData.points}
              px={px}
              py={py}
              curve={curve}
              className={clsx(' transition-[stroke-width]', 'stroke-2')}
              stroke={data[hoveringId].color}
            />
          </g>
        )}
        {/* hover effect put last so it shows on top */}
        {hoveringId && hoverData && (
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
