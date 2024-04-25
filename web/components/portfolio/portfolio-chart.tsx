import { HistoryPoint, ValueKind } from 'common/chart'
import { formatMoneyNumber } from 'common/util/format'
import { axisBottom, axisRight } from 'd3-axis'
import { ScaleContinuousNumeric, ScaleTime } from 'd3-scale'
import { CurveFactory, curveStepAfter } from 'd3-shape'
import { mapValues } from 'lodash'
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useEvent } from 'web/hooks/use-event'
import { dataAtTimeSelector, dataAtXSelector } from '../charts/generic-charts'
import {
  AreaPath,
  LinePath,
  PointerMode,
  SVGChart,
  SliceMarker,
  TooltipProps,
  ZoomParams,
} from '../charts/helpers'
import { ZoomSlider } from '../charts/zoom-slider'
import clsx from 'clsx'

type AreaPointType = {
  x: number // The x-coordinate
  y0: number // Lower boundary of the area
  y1: number // Upper boundary of the area
}
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

  const selectors = useMemo(() => {
    return Object.fromEntries(
      stackedData.map(({ id, points }) => [id, dataAtXSelector(points, xScale)])
    )
  }, [stackedData, xScale])

  const getMarkerPosition = useEvent((mouseX: number, mouseY: number) => {
    const valueY = yScale.invert(mouseY)
    const ps = stackedData.map((data) => selectors[data.id](mouseX))
    let closestIdx = stackedData.length - 1
    const topmostIdx = stackedData.length - 1
    ps.forEach((p, i) => {
      const closePrev = ps[closestIdx].prev
      const closestDist = closePrev ? Math.abs(closePrev.y - valueY) : 1
      if (p.prev && p.next && Math.abs(p.prev.y - valueY) < closestDist) {
        closestIdx = i
      }
    })
    const p = ps[topmostIdx]
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
        {stackedData.map(({ id, points, color }, i) => {
          const { points: previousPoints } =
            i > 0 ? stackedData[i - 1] : { points: undefined }
          const areaData = points.map((point, idx) => ({
            x: point.x,
            y0: previousPoints ? previousPoints[idx].y : yScale(0), // Use previous dataset's y if available, otherwise use 0
            y1: point.y,
          }))
          return (
            <>
              <LinePath
                data={points}
                px={px}
                py={py}
                curve={curve}
                className={clsx(' transition-[stroke-width]', 'stroke-2')}
                stroke={color}
              />
              <AreaPath<AreaPointType>
                key={id}
                data={areaData}
                px={(d) => xScale(d.x)} // You might need to adjust how these are passed based on your AreaPath implementation
                py0={(d) => yScale(d.y0)} // Lower boundary
                py1={(d) => yScale(d.y1)} // Upper boundary
                fill={color}
                curve={curve}
                opacity={hoveringId == id ? 1 : 0.5}
                className="transition-opacity"
              />
            </>
          )
        })}
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
