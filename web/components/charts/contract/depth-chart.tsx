import { LimitBet } from 'common/bet'
import {
  CPMMBinaryContract,
  PseudoNumericContract,
  StonkContract,
} from 'common/contract'
import { getDisplayProbability } from 'common/calculate'
import { Col } from '../../layout/col'
import { HistoryPoint } from 'common/chart'
import { scaleLinear } from 'd3-scale'
import { AreaWithTopStroke, SVGChart, formatPct } from '../helpers'
import { curveStepBefore, line } from 'd3-shape'
import { axisBottom, axisRight } from 'd3-axis'
import { formatMoney } from 'common/util/format'

export function DepthChart(props: {
  contract: CPMMBinaryContract | PseudoNumericContract | StonkContract
  yesBets: LimitBet[]
  noBets: LimitBet[]
  width: number
  height: number
}) {
  const { contract, yesBets, noBets, width, height } = props

  // Won't display a depth chart for numeric contracts, only binary contracts right now
  if (contract.outcomeType === 'PSEUDO_NUMERIC') {
    return null
  }

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

  const margin = { top: 10, bottom: 20, left: 20, right: 60 }

  const innerW = width - (margin.left + margin.right)
  const innerH = height - (margin.top + margin.bottom)

  const xScale = scaleLinear().domain([0, 1]).range([0, innerW])
  const yScale = scaleLinear().domain([0, maxAmount]).range([innerH, 0])
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
    <Col className="text-ink-800 items-center">
      <h2>Question depth</h2>
      <SVGChart
        w={width}
        h={height}
        margin={margin}
        xAxis={xAxis}
        yAxis={yAxis}
      >
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
    </Col>
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
