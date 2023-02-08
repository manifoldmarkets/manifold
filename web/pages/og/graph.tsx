import { area, curveStepBefore, line } from 'd3-shape'
import { scaleLinear, scaleTime } from 'd3-scale'
import { HistoryPoint } from 'web/components/charts/generic-charts'
import { computeColorStops } from 'web/components/charts/helpers'
import { axisBottom, axisRight } from 'd3-axis'
import { formatMoneyNumber } from 'common/util/format'

export function Graph(props: {
  data: HistoryPoint[]
  size: number
  margin: number
  scaleX?: number
}) {
  const { data, size, margin, scaleX } = props
  const w = size
  const h = size
  const innerW = w - 2 * margin
  const innerH = h - 2 * margin
  const visibleRange = [data[0].x, data[data.length - 1].x]
  const minY = Math.min(...data.map((p) => p.y))
  const maxY = Math.max(...data.map((p) => p.y))
  const curve = curveStepBefore

  const xScale = scaleTime(visibleRange, [0, w - margin])
  const yScale = scaleLinear([minY, maxY], [h - margin, 0])
  const px = (p: HistoryPoint) => xScale(p.x)
  const py0 = yScale(yScale.domain()[0])
  const py1 = (p: HistoryPoint) => yScale(p.y)
  const clipId = ':rnm:'
  const gradientId = ':rnc:'
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const da = area(px, py0, py1).curve(curve)(data)!
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const dl = line(px, py1).curve(curve)(data)!
  const color = (p: HistoryPoint) => (p.y >= 0 ? '#14b8a6' : '#FFA799')
  const stops = computeColorStops(data, color, px)

  // TODO: how do we add axes?
  const nTicks = h < 200 ? 3 : 5
  const xAxis = axisBottom<Date>(xScale).ticks(w / 100)
  const yAxis = axisRight<number>(yScale)
    .ticks(nTicks)
    .tickFormat((n) => formatMoneyNumber(n))

  return (
    <svg width={w * (scaleX ?? 0)} height={h} viewBox={`0 0 ${w} ${h}`}>
      <clipPath id={clipId}>
        <rect x={0} y={0} width={innerW * (scaleX ?? 0)} height={innerH} />
      </clipPath>
      <g transform={`translate(${margin / 2}, ${margin / 2})`}>
        <g transform={`translate(0, ${h})`} />
        <g clipPath={`url(#${clipId})`}>
          <defs>
            <linearGradient gradientUnits="userSpaceOnUse" id={gradientId}>
              {stops.map((s, i) => (
                <stop key={i} offset={`${s.x / w}`} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>

          <g>
            <path d={da} fill={`url(#${gradientId})`} opacity={0.2} />
            <path d={dl} stroke={`url(#${gradientId})`} fill={'none'} />
          </g>
        </g>
      </g>
    </svg>
  )
}
