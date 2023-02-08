import { area, curveStepBefore, line } from 'd3-shape'
import { scaleLinear, scaleTime } from 'd3-scale'
export type ogPoint = { x: number; y: number }
export function Graph(props: {
  data: ogPoint[]
  size: number
  scaleX?: number
}) {
  const { data, size, scaleX } = props
  const w = size
  const h = size
  const visibleRange = [data[0].x, data[data.length - 1].x]
  const minY = Math.min(...data.map((p) => p.y))
  const maxY = Math.max(...data.map((p) => p.y))
  const curve = curveStepBefore

  const xScale = scaleTime(visibleRange, [0, w])
  const yScale = scaleLinear([minY, maxY], [h, 0])
  const px = (p: ogPoint) => xScale(p.x)
  const py0 = yScale(0)
  const py1 = (p: ogPoint) => yScale(p.y)
  const clipId = ':rnm:'
  const gradientId = ':rnc:'
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const da = area(px, py0, py1).curve(curve)(data)!
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const dl = line(px, py1).curve(curve)(data)!
  const color = (p: ogPoint) => (p.y >= 0 ? '#14b8a6' : '#FFA799')
  const stops = computeColorStops(data, color, px)

  return (
    <svg width={w * (scaleX ?? 1)} height={h} viewBox={`0 0 ${w} ${h}`}>
      <clipPath id={clipId}>
        <rect x={0} y={0} width={w * (scaleX ?? 1)} height={h} />
      </clipPath>

      <g>
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

const computeColorStops = (
  data: ogPoint[],
  pc: (p: ogPoint) => string,
  px: (p: ogPoint) => number
) => {
  const segments: { x: number; color: string }[] = []
  let currOffset = px(data[0])
  let currColor = pc(data[0])
  for (const p of data) {
    const c = pc(p)
    if (c !== currColor) {
      segments.push({ x: currOffset, color: currColor })
      currOffset = px(p)
      currColor = c
    }
  }
  segments.push({ x: currOffset, color: currColor })

  const stops: { x: number; color: string }[] = []
  stops.push({ x: segments[0].x, color: segments[0].color })
  for (const s of segments.slice(1)) {
    stops.push({ x: s.x, color: stops[stops.length - 1].color })
    stops.push({ x: s.x, color: s.color })
  }
  return stops
}
