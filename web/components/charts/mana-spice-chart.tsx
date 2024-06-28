import clsx from 'clsx'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { Axis } from 'd3-axis'
import { ScaleTime } from 'd3-scale'
import { pointer } from 'd3-selection'
import React, { ReactNode, useEffect, useId } from 'react'
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

export const ManaSpiceChart = <X, TT extends { x: number; y: number }>(props: {
  children: ReactNode
  w: number
  h: number
  xAxis: Axis<X>
  yAxis: Axis<number>
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
            axis={yAxis}
            w={w}
            noGridlines={noGridlines}
            iconSVG={ManaSvg}
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

export const ManaSvg = `<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 1500 1500"
  xmlns:v="https://vecta.io/nano"
>
  <path
    d="M1243.52 750.2c0 296.35-196.45 542.79-455.4 593.54-32.1 6.3-65.17 9.59-98.95 9.59-306.16 0-554.35-270.04-554.35-603.13 0-306.62 210.28-559.8 482.51-598.12a515.25 515.25 0 0 1 71.84-5.02c306.16 0 554.35 270.03 554.35 603.14z"
    fill="#a5b4fc"
  />
  <path
    d="M1463.44 991.35c-92.4 295.59-349.68 508.26-652.62 508.26l-116.75.37a643.6 643.6 0 0 0 58.02-3.06c275.37-27.12 504.01-230.47 589.83-505.57h121.53zm28.18-124.5c-2.35 16.38-5.2 32.57-8.52 48.59h-121.56a802.34 802.34 0 0 0 8.5-48.59h121.58zm6.53-172.08h-121.67c-24.65-367.09-292.23-660.8-628.57-691.69C728.54 1.31 708.96.4 689.17.4h144.2c353.3 12.36 639.42 314.02 664.78 694.38z"
    fill="#6366f1"
  />
  <g fill="#a5b4fc">
    <path
      d="M833.32.39h-44.99C795.8.13 803.3 0 810.82 0a647.22 647.22 0 0 1 22.5.39zM689.17 147.06a515.25 515.25 0 0 0-71.84 5.02C358.48 202.91 162.1 449.31 162.1 745.6c0 333.11 248.2 603.14 554.35 603.14 24.28 0 48.21-1.7 71.67-5 258.96-50.75 455.4-297.19 455.4-593.54 0-333.1-248.19-603.14-554.35-603.14z"
    />
    <path
      d="M1376.48 694.77c-24.65-367.09-292.23-660.8-628.57-691.69C728.54 1.31 708.96.4 689.17.4 308.55.39 0 336.09 0 750.2S308.55 1500 689.17 1500l4.9-.02a643.6 643.6 0 0 0 58.02-3.06c275.37-27.12 504.01-230.47 589.83-505.57 7.73-24.75 14.3-50.08 19.64-75.92a802.34 802.34 0 0 0 8.5-48.59c5.46-38.01 8.3-76.97 8.3-116.65a820.01 820.01 0 0 0-1.86-55.43zm-588.36 648.98c-32.1 6.3-65.17 9.59-98.95 9.59-306.16 0-554.35-270.04-554.35-603.13 0-306.62 210.28-559.8 482.51-598.12a515.25 515.25 0 0 1 71.84-5.02c306.16 0 554.35 270.03 554.35 603.14 0 296.35-196.45 542.79-455.4 593.54z"
    />
  </g>
  <path
    d="M788.12 1343.75c-32.1 6.3-65.17 9.59-98.95 9.59-306.16 0-554.35-270.04-554.35-603.13 0-306.62 210.28-559.8 482.51-598.12C358.48 202.92 162.1 449.32 162.1 745.61c0 333.11 248.2 603.14 554.35 603.14 24.28 0 48.21-1.7 71.67-5z"
    fill="#312e81"
  />
  <path
    d="M1243.52 750.2c0 296.35-196.45 542.79-455.4 593.54-23.46 3.3-47.39 5-71.67 5-306.15 0-554.35-270.03-554.35-603.14 0-296.29 196.38-542.69 455.23-593.52a515.25 515.25 0 0 1 71.84-5.02c306.16 0 554.35 270.03 554.35 603.14z"
    fill="#4338ca"
  />
  <g fill="#312e81">
    <path
      d="M1056.52 375.75v771.01H939.09v-568.2L708.26 948.5l-229.8-366.8v565.06H361.02V375.75h125.53l222.51 357.04 220.92-357.04h126.54z"
    />
    <path
      d="M273.74 911.11v-67.18h869.97v67.18zm0 141.79v-67.18h869.97v67.18z"
    />
  </g>
  <g fill="#a5b4fc">
    <path
      d="M1036.92 364.69v771.01H919.48V567.5L688.65 937.44l-229.79-366.8v565.06H341.42V364.69h125.53l222.51 357.04 220.91-357.04h126.55z"
    />
    <path
      d="M254.14 900.05v-67.18h869.97v67.18zm0 141.79v-67.18h869.97v67.18z"
    />
  </g>
  <path
    d="M1499.98 749.81c0 39.82-2.86 78.91-8.36 117.04h-121.58c5.46-38.01 8.3-76.97 8.3-116.65a820.01 820.01 0 0 0-1.86-55.43h121.67c1.22 18.17 1.83 36.53 1.83 55.03zm-16.87 165.62c-5.35 25.83-11.93 51.17-19.67 75.92h-121.53c7.73-24.75 14.3-50.08 19.64-75.92h121.56z"
    fill="#818cf8"
  />
</svg>
`

export const SpiceSvg = `<?xml version="1.0" encoding="UTF-8"?><svg
  id="Layer_2"
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 1500 1500"
>
  <defs>
    <style>
      .cls-1 {
        fill: #fdd34e;
      }
      .cls-1,
      .cls-2,
      .cls-3,
      .cls-4,
      .cls-5 {
        stroke-width: 0px;
      }
      .cls-2 {
        fill: none;
      }
      .cls-3 {
        fill: #a5b4fc;
      }
      .cls-4 {
        fill: #d97708;
      }
      .cls-5 {
        fill: #b45309;
      }
    </style>
  </defs>
  <path
    class="cls-3"
    d="M1243.52,750.2c0,296.35-196.45,542.79-455.4,593.54-32.1,6.3-65.17,9.59-98.95,9.59-306.16,0-554.35-270.04-554.35-603.13,0-306.62,210.28-559.8,482.51-598.12,23.52-3.31,47.5-5.02,71.84-5.02,306.16,0,554.35,270.03,554.35,603.14Z"
  />
  <path
    class="cls-5"
    d="M1463.44,991.35c-92.4,295.59-349.68,508.26-652.62,508.26l-116.75.37c19.54-.15,38.89-1.18,58.02-3.06,275.37-27.12,504.01-230.47,589.83-505.57h121.53Z"
  />
  <path
    class="cls-5"
    d="M1491.62,866.85c-2.35,16.38-5.2,32.57-8.52,48.59h-121.56c3.31-16,6.15-32.21,8.5-48.59h121.58Z"
  />
  <path
    class="cls-5"
    d="M1498.15,694.77h-121.67C1351.83,327.68,1084.25,33.97,747.91,3.08c-19.37-1.77-38.95-2.68-58.74-2.68h144.2c353.3,12.36,639.42,314.02,664.78,694.38Z"
  />
  <path
    class="cls-3"
    d="M833.32.39h-44.99c7.47-.26,14.97-.39,22.49-.39s15.03.13,22.5.39Z"
  />
  <path
    class="cls-3"
    d="M689.17,147.06c-24.34,0-48.32,1.71-71.84,5.02-258.85,50.83-455.23,297.23-455.23,593.52,0,333.11,248.2,603.14,554.35,603.14,24.28,0,48.21-1.7,71.67-5,258.96-50.75,455.4-297.19,455.4-593.54,0-333.1-248.19-603.14-554.35-603.14Z"
  />
  <path
    class="cls-1"
    d="M1376.48,694.77C1351.83,327.68,1084.25,33.97,747.91,3.08c-19.37-1.77-38.95-2.68-58.74-2.68C308.55.39,0,336.09,0,750.2s308.55,749.8,689.17,749.8l4.9-.02c19.54-.15,38.89-1.18,58.02-3.06,275.37-27.12,504.01-230.47,589.83-505.57,7.73-24.75,14.3-50.08,19.64-75.92,3.31-16,6.15-32.21,8.5-48.59,5.46-38.01,8.3-76.97,8.3-116.65,0-18.64-.62-37.13-1.86-55.43ZM788.12,1343.75c-32.1,6.3-65.17,9.59-98.95,9.59-306.16,0-554.35-270.04-554.35-603.13,0-306.62,210.28-559.8,482.51-598.12,23.52-3.31,47.5-5.02,71.84-5.02,306.16,0,554.35,270.03,554.35,603.14,0,296.35-196.45,542.79-455.4,593.54Z"
  />
  <path
    class="cls-5"
    d="M788.12,1343.75c-32.1,6.3-65.17,9.59-98.95,9.59-306.16,0-554.35-270.04-554.35-603.13,0-306.62,210.28-559.8,482.51-598.12-258.85,50.83-455.23,297.23-455.23,593.52,0,333.11,248.2,603.14,554.35,603.14,24.28,0,48.21-1.7,71.67-5Z"
  />
  <path
    class="cls-4"
    d="M1243.52,750.2c0,296.35-196.45,542.79-455.4,593.54-23.46,3.3-47.39,5-71.67,5-306.15,0-554.35-270.03-554.35-603.14,0-296.29,196.38-542.69,455.23-593.52,23.52-3.31,47.5-5.02,71.84-5.02,306.16,0,554.35,270.03,554.35,603.14Z"
  />
  <line class="cls-2" x1="689.17" y1="1500" x2="694.07" y2="1499.98" />
  <path
    class="cls-4"
    d="M1499.98,749.81c0,39.82-2.86,78.91-8.36,117.04h-121.58c5.46-38.01,8.3-76.97,8.3-116.65,0-18.64-.62-37.13-1.86-55.43h121.67c1.22,18.17,1.83,36.53,1.83,55.03Z"
  />
  <path
    class="cls-4"
    d="M1483.11,915.43c-5.35,25.83-11.93,51.17-19.67,75.92h-121.53c7.73-24.75,14.3-50.08,19.64-75.92h121.56Z"
  />
  <path
    class="cls-5"
    d="M467.45,1144.59V373.4h117.99v771.19h-117.99ZM574.26,877.98v-117.88h157.66c33.9,0,61.69-12.48,83.39-37.46,21.7-24.95,32.56-57.65,32.56-98.05,0-26.43-5.6-49.74-16.79-69.95-11.19-20.2-26.61-36.18-46.27-47.94-19.69-11.73-42.39-17.24-68.15-16.51h-142.4v-116.79l144.43-1.09c48.82,0,91.88,10.83,129.18,32.5,37.28,21.67,66.44,51.42,87.46,89.24,21.01,37.83,31.54,81.71,31.54,131.65s-9.84,92.73-29.49,130.55c-19.67,37.83-47.14,67.59-82.39,89.24-35.26,21.67-75.61,32.5-121.04,32.5h-159.68Z"
  />
  <path
    class="cls-1"
    d="M447.76,1133.53V362.33h117.99v771.19h-117.99ZM554.56,866.92v-117.88h157.66c33.9,0,61.69-12.48,83.39-37.46,21.7-24.95,32.56-57.65,32.56-98.05,0-26.43-5.6-49.74-16.79-69.95-11.19-20.2-26.61-36.18-46.27-47.94-19.69-11.73-42.39-17.24-68.15-16.51h-142.4v-116.79l144.43-1.09c48.82,0,91.88,10.83,129.18,32.5,37.28,21.67,66.44,51.42,87.46,89.24,21.01,37.83,31.54,81.71,31.54,131.65s-9.84,92.73-29.49,130.55c-19.67,37.83-47.14,67.59-82.39,89.24-35.26,21.67-75.61,32.5-121.04,32.5h-159.68Z"
  />
</svg>

`
