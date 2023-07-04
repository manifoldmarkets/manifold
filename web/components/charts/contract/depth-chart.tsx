import { LimitBet } from 'common/bet'
import { CPMMBinaryContract, StonkContract } from 'common/contract'
import { getDisplayProbability } from 'common/calculate'
import { HistoryPoint } from 'common/chart'
import { scaleLinear } from 'd3-scale'
import { AreaWithTopStroke, SVGChart, formatPct } from '../helpers'
import { curveStepBefore, line } from 'd3-shape'
import { axisBottom, axisRight } from 'd3-axis'
import { formatMoney } from 'common/util/format'

export function DepthChart(props: {
  contract: CPMMBinaryContract | StonkContract
  yesBets: LimitBet[]
  noBets: LimitBet[]
  width: number
  height: number
}) {
  const { contract, yesBets, noBets, width, height } = props

  const yesData = cumulative(yesBets)
  const noData = cumulative(noBets)
  if (yesData.length === 0 || noData.length === 0) {
    return null
  }
  const maxAmount = Math.max(
    yesData[yesData.length - 1].y,
    noData[noData.length - 1].y
  )

  // extend curve out to edges: \ / ~>  --\ /-- and middle down to 0
  yesData.push({ x: 0, y: yesData[yesData.length - 1].y })
  yesData.unshift({ x: yesData[0].x, y: 0 })
  noData.push({ x: 1, y: noData[noData.length - 1].y })
  noData.unshift({ x: noData[0].x, y: 0 })

  const currentValue = getDisplayProbability(contract)

  const xScale = scaleLinear().domain([0, 1]).range([0, width])
  const yScale = scaleLinear().domain([0, maxAmount]).range([height, 0])
  const dl = line<HistoryPoint>()
    .x((p) => xScale(p.x))
    .y((p) => yScale(p.y))
    .curve(curveStepBefore)

  const yAxis = axisRight<number>(yScale).ticks(8).tickFormat(formatMoney)
  const xAxis = axisBottom<number>(xScale).ticks(6).tickFormat(formatPct)

  const dYes = dl(yesData)
  const dNo = dl(noData)

  if (dYes === null || dNo === null) return null

  return (
    <SVGChart w={width} h={height} xAxis={xAxis} yAxis={yAxis}>
      <AreaWithTopStroke
        color="#11b981"
        data={yesData}
        px={(p) => xScale(p.x)}
        py0={yScale(0)}
        py1={(p) => yScale(p.y)}
        curve={curveStepBefore}
      />
      <AreaWithTopStroke
        color="red"
        data={noData}
        px={(p) => xScale(p.x)}
        py0={yScale(0)}
        py1={(p) => yScale(p.y)}
        curve={curveStepBefore}
      />

      {/* line at current value */}
      <line
        x1={xScale(currentValue)}
        y1={yScale(0)}
        x2={xScale(currentValue)}
        y2={yScale(maxAmount)}
        stroke="rgb(99 102 241)"
        strokeWidth={1}
        strokeDasharray="2 2"
      />
    </SVGChart>
  )
}

// Converts a list of LimitBets into a list of coordinates to render into a depth chart.
// Going in order of probability, the y value accumulates each order's amount.
function cumulative(bets: LimitBet[]): HistoryPoint[] {
  const result: HistoryPoint[] = []
  let totalAmount = 0

  for (let i = 0; i < bets.length; i++) {
    totalAmount += bets[i].orderAmount
    result.push({ x: bets[i].limitProb, y: totalAmount })
  }

  return result
}
