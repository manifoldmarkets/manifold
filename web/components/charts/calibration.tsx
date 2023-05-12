import { axisBottom, axisRight } from 'd3-axis'
import { scaleLinear } from 'd3-scale'
import { points } from 'web/pages/[username]/calibration'
import { SVGChart, formatPct } from './helpers'

type Point = { x: number; y: number }

export function CalibrationChart(props: {
  yesPoints: Point[]
  noPoints: Point[]
  width: number
  height: number
}) {
  const { yesPoints, noPoints, width, height } = props

  const margin = { top: 5, bottom: 30, left: 5, right: 30 }
  const innerW = width - (margin.left + margin.right)
  const innerH = height - (margin.top + margin.bottom)

  const xScale = scaleLinear()
    .domain([0, 1])
    .range([5, innerW - 5])
  const yScale = scaleLinear()
    .domain([0, 1])
    .range([innerH - 5, 5])

  const tickVals = points.map((p) => p / 100)

  const format = (d: number) =>
    (d <= 0.9 || d === 0.99) && (d >= 0.1 || d === 0.01) ? formatPct(d) : ''

  const xAxis = axisBottom<number>(xScale)
    .tickFormat(format)
    .tickValues(tickVals)

  const yAxis = axisRight<number>(yScale)
    .tickFormat(format)
    .tickValues(tickVals)

  const px = (p: Point) => xScale(p.x)
  const py = (p: Point) => yScale(p.y)

  return (
    <SVGChart w={width} h={height} xAxis={xAxis} yAxis={yAxis} margin={margin}>
      {/* points */}
      {yesPoints.map((p, i) => (
        <circle key={i} cx={px(p)} cy={py(p)} r="4" fill="green" />
      ))}
      {noPoints.map((p, i) => (
        <circle key={i} cx={px(p)} cy={py(p)} r="4" fill="red" />
      ))}
      {/* line x = y */}
      <line
        x1={xScale(0)}
        y1={yScale(0)}
        x2={xScale(1)}
        y2={yScale(1)}
        stroke="rgb(99 102 241)"
        strokeWidth={1}
        strokeDasharray="4 8"
      />
    </SVGChart>
  )
}
