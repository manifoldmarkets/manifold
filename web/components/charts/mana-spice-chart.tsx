import clsx from 'clsx'
import { Axis } from 'd3-axis'
import { pointer, select } from 'd3-selection'
import { CurveFactory, area, line } from 'd3-shape'
import { ZoomBehavior, zoom, zoomIdentity } from 'd3-zoom'
import dayjs from 'dayjs'
import React, {
  ReactNode,
  SVGProps,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Contract } from 'common/contract'
import { useMeasureSize } from 'web/hooks/use-measure-size'
import { clamp, sortBy } from 'lodash'
import { ScaleTime, scaleTime } from 'd3-scale'
import { useEvent } from 'web/hooks/use-event'
import { buildArray } from 'common/util/array'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import {
  AnnotationMarker,
  PointerMode,
  TooltipContainer,
  XAxis,
  YAxis,
  ZOOM_DRAG_THRESHOLD,
  ZoomParams,
  getTooltipPosition,
  useInitZoomBehavior,
} from './helpers'
import { BALANCE_COLOR, SPICE_COLOR } from '../portfolio/portfolio-value-graph'
import { SPICE_NAME } from 'common/envs/constants'

export const ManaSpiceChart = <X, TT extends { x: number; y: number }>(props: {
  children: ReactNode
  w: number
  h: number
  xAxis: Axis<X>
  yAxis: Axis<number>
  yLeftAxis: Axis<number>
  ttParams?: TT | undefined
  zoomParams?: ZoomParams
  onMouseOver?: (mouseX: number, mouseY: number) => void
  onMouseLeave?: () => void
  Tooltip?: (props: TT) => ReactNode
  noGridlines?: boolean
  className?: string
  // Chart annotation props
  pointerMode?: PointerMode
  onClick?: (x: number, y: number) => void
  xScale?: ScaleTime<number, number>
  yAtTime?: (time: number, answerId?: string | null) => number
  y0?: number
  onHoverAnnotation?: (id: number | null) => void
  hoveredAnnotation?: number | null
  chartAnnotations?: ChartAnnotation[]
  hideXAxis?: boolean
}) => {
  const {
    children,
    w,
    h,
    xAxis,
    yAxis,
    yLeftAxis,
    ttParams,
    zoomParams,
    onMouseOver,
    onMouseLeave,
    Tooltip,
    noGridlines,
    className,
    pointerMode = 'zoom',
    onClick,
    xScale,
    yAtTime,
    chartAnnotations,
    y0,
    onHoverAnnotation,
    hoveredAnnotation,
    hideXAxis,
  } = props

  const showAnnotations = xScale && yAtTime && y0 !== undefined
  const onPointerMove = (ev: React.PointerEvent) => {
    if (ev.pointerType === 'mouse' || ev.pointerType === 'pen') {
      const [x, y] = pointer(ev)
      onMouseOver?.(x, y)
    }
  }

  const { onPointerUp, selectStart, selectEnd } = useInitZoomBehavior({
    zoomParams,
    w,
    h,
    pointerMode,
    onClick,
  })

  useEffect(() => {
    window.addEventListener('pointerup', onPointerUp)
    return () => window.removeEventListener('pointerup', onPointerUp)
  }, [onPointerUp])

  const onPointerLeave = () => {
    onMouseLeave?.()
    onHoverAnnotation?.(null)
  }

  const id = useId()

  if (w <= 0 || h <= 0) {
    // i.e. chart is smaller than margin
    return null
  }

  return (
    <div
      className={clsx(
        className,
        'relative select-none',
        pointerMode === 'zoom'
          ? 'cursor-crosshair'
          : pointerMode === 'examine'
          ? 'cursor-pointer'
          : 'cursor-copy'
      )}
      onPointerEnter={onPointerMove}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {ttParams && Tooltip && (
        <TooltipContainer
          calculatePos={(ttw, tth) =>
            getTooltipPosition(ttParams.x, ttParams.y, w, h, ttw, tth)
          }
        >
          {Tooltip(ttParams)}
        </TooltipContainer>
      )}
      {selectStart != undefined && selectEnd != undefined && (
        // swipeover
        <div
          className={clsx(
            selectEnd - selectStart > ZOOM_DRAG_THRESHOLD
              ? 'bg-primary-400/40'
              : 'bg-canvas-100/40',
            'absolute -z-10 transition-colors'
          )}
          style={{
            left: selectStart,
            right: w - selectEnd,
            top: 0,
            bottom: 0,
          }}
        />
      )}
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        overflow="visible"
        ref={zoomParams?.svgRef}
      >
        <defs>
          <filter id={`${id}-blur`}>
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <mask id={`${id}-mask`}>
            <rect
              x={-8}
              y={-8}
              width={w + 16}
              height={h + 16}
              fill="white"
              filter={`url(#${id}-blur)`}
            />
          </mask>
          <clipPath id={`${id}-clip`}>
            <rect x={-32} y={-32} width={w + 64} height={h + 64} />
          </clipPath>
        </defs>

        <g>
          {!hideXAxis && <XAxis axis={xAxis} w={w} h={h} />}
          <YAxis
            w={0}
            axis={yLeftAxis}
            noGridlines={noGridlines}
            leftAligned
            color={SPICE_COLOR}
            label={SPICE_NAME}
            h={h}
          />
          <YAxis
            axis={yAxis}
            w={w}
            noGridlines={noGridlines}
            color={BALANCE_COLOR}
            label={'Mana'}
            h={h}
          />
          {/* clip to stop pointer events outside of graph, and mask for the blur to indicate zoom */}
          <g clipPath={`url(#${id}-clip)`} mask={`url(#${id}-mask)`}>
            {children}
            {/* We can't just change z-index, we have to change rendering order*/}
            {showAnnotations &&
              chartAnnotations
                ?.filter((a) => a.id !== hoveredAnnotation)
                .map((a) => (
                  <AnnotationMarker
                    key={a.id}
                    x={xScale(a.event_time)}
                    y0={y0}
                    y1={yAtTime(a.event_time, a.answer_id)}
                    id={a.id}
                    onHover={(id) => onHoverAnnotation?.(id)}
                    onLeave={() => onHoverAnnotation?.(null)}
                    isHovered={hoveredAnnotation === a.id}
                  />
                ))}
            {showAnnotations &&
              chartAnnotations
                ?.filter((a) => a.id === hoveredAnnotation)
                .map((a) => (
                  <AnnotationMarker
                    key={a.id}
                    x={xScale(a.event_time)}
                    y0={y0}
                    y1={yAtTime(a.event_time, a.answer_id)}
                    id={a.id}
                    onHover={(id) => onHoverAnnotation?.(id)}
                    onLeave={() => onHoverAnnotation?.(null)}
                    isHovered={hoveredAnnotation === a.id}
                  />
                ))}
          </g>
        </g>
      </svg>
    </div>
  )
}
