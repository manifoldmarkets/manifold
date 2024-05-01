import { HistoryPoint, ValueKind } from 'common/chart'
import { formatMoneyNumber } from 'common/util/format'
import { axisBottom, axisRight } from 'd3-axis'
import { ScaleContinuousNumeric, ScaleTime } from 'd3-scale'
import { CurveFactory, curveStepAfter } from 'd3-shape'
import { mapValues } from 'lodash'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEvent } from 'web/hooks/use-event'
import { dataAtTimeSelector, dataAtXSelector } from '../charts/generic-charts'
import {
  AreaPath,
  PointerMode,
  SVGChart,
  SliceMarker,
  TooltipProps,
  ZoomParams,
} from '../charts/helpers'
import { ZoomSlider } from '../charts/zoom-slider'
import { PortfolioMode } from './portfolio-value-graph'
import { PortfolioHoveredGraphType } from './portfolio-value-section'
import { Col } from '../layout/col'
import dayjs from 'dayjs'
import { CoinNumber } from '../widgets/manaCoinNumber'

type AreaPointType = {
  x: number // The x-coordinate
  y0: number // Lower boundary of the area
  y1: number // Upper boundary of the area
}

// hacky solution
const BALANCE_IDX = 0
const INVESTED_IDX = 1

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
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
  pointerMode?: PointerMode
  setGraphBalance: (balance: number | undefined) => void
  setGraphInvested: (invested: number | undefined) => void
  setPortfolioFocus: (mode: PortfolioMode) => void
  portfolioHoveredGraph: PortfolioHoveredGraphType
  setPortfolioHoveredGraph: (hovered: PortfolioHoveredGraphType) => void
}) => {
  const {
    data,
    w,
    h,
    yScale,
    zoomParams,
    showZoomer,
    pointerMode = 'zoom',
    hoveredAnnotation,
    setHoveredAnnotation,
    yKind,
    setGraphBalance,
    setGraphInvested,
    setPortfolioFocus,
    portfolioHoveredGraph,
    setPortfolioHoveredGraph,
  } = props

  useEffect(() => {
    if (props.xScale) {
      zoomParams?.setXScale(props.xScale)
    }
  }, [w])

  const xScale = zoomParams?.viewXScale ?? props.xScale
  const [ttParams, setTTParams] = useState<
    TooltipProps<P> & {
      ans: string
    }
  >()
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

  const unstackedSelectors = useMemo(() => {
    // Create a new object where keys are the IDs of each dataset and values are the selector functions
    return Object.fromEntries(
      Object.entries(data).map(([id, { points }]) => {
        // For each dataset, create a selector function that can find the data point based on the x-value
        return [id, dataAtXSelector(points, xScale)]
      })
    )
  }, [data, xScale])

  const getMarkerPosition = useEvent((mouseX: number, mouseY: number) => {
    const ps = stackedData.map((data) => selectors[data.id](mouseX))
    const unstackedPs = Object.entries(data).map(([id]) => {
      return unstackedSelectors[id](mouseX)
    })
    const topmostIdx = stackedData.length - 1

    unstackedPs.forEach((p, i) => {
      if (i == BALANCE_IDX && p.prev?.y) {
        setGraphBalance(p.prev.y)
      }
      if (i == INVESTED_IDX && p.prev?.y) {
        setGraphInvested(p.prev.y)
      }
    })

    const p = ps[topmostIdx]
    if (p?.prev) {
      return {
        ...p,
        ans: stackedData[topmostIdx].id,
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
    setGraphBalance(undefined)
    setGraphInvested(undefined)
  })

  const getYValueByAnswerIdAndTime = (time: number, answerId: string) => {
    const selector = timeSelectors[answerId]
    if (!selector) return null
    const point = selector(time)
    return point ? yScale(point.nearest.y) : null
  }

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
        Tooltip={(props) => {
          // eslint-disable-next-line react/prop-types
          const date = xScale.invert(props.x)
          const d = dayjs(date)
          return (
            <Col className="text-xs sm:text-sm">
              {ttParams && ttParams.prev && (
                <span className="text-ink-900">
                  <CoinNumber
                    amount={ttParams.prev.y}
                    isInline
                    className="font-semibold"
                  />{' '}
                  <span>net</span>
                </span>
              )}
              <div className="text-2xs text-ink-600 font-normal sm:text-xs">
                {d.format('MMM/D/YY')} {d.format('h:mm A')}
              </div>
            </Col>
          )
        }}
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
            y0: previousPoints ? previousPoints[idx].y : 0, // Use previous dataset's y if available, otherwise use 0
            y1: point.y,
          }))
          return (
            <>
              <AreaPath<AreaPointType>
                key={id}
                data={areaData}
                px={(d) => xScale(d.x)} // You might need to adjust how these are passed based on your AreaPath implementation
                py0={(d) => yScale(d.y0)} // Lower boundary
                py1={(d) => yScale(d.y1)} // Upper boundary
                fill={color}
                curve={curve}
                opacity={portfolioHoveredGraph == id ? 1 : 0.85}
                className="transition-opacity"
                onClick={() => {
                  setPortfolioFocus(id as PortfolioMode)
                }}
                onMouseEnter={() => {
                  setPortfolioHoveredGraph(id as PortfolioHoveredGraphType)
                }}
                onMouseLeave={() => {
                  setPortfolioHoveredGraph(undefined)
                }}
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
