import { LimitBet } from 'common/bet'
import {
  BinaryContract,
  CPMMMultiContract,
  StonkContract,
} from 'common/contract'
import { getDisplayProbability } from 'common/calculate'
import { HistoryPoint } from 'common/chart'
import { scaleLinear } from 'd3-scale'
import { AreaWithTopStroke, SVGChart, formatPct } from '../helpers'
import { curveStepAfter } from 'd3-shape'
import { axisBottom, axisRight } from 'd3-axis'
import { formatLargeNumber } from 'common/util/format'
import { Answer } from 'common/answer'
import { DEM_COLOR, REP_COLOR } from 'web/components/usa-map/state-election-map'

function getColor(color: string) {
  if (color === 'azure') {
    return DEM_COLOR
  } else if (color === 'sienna') {
    return REP_COLOR
  }
  return color
}

export function DepthChart(props: {
  contract: BinaryContract | StonkContract | CPMMMultiContract
  answer?: Answer
  yesBets: LimitBet[]
  noBets: LimitBet[]
  width: number
  height: number
  pseudonym?: {
    YES: {
      pseudonymName: string
      pseudonymColor: string
    }
    NO: {
      pseudonymName: string
      pseudonymColor: string
    }
  }
}) {
  const { contract, answer, yesBets, noBets, width, height, pseudonym } = props

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

  const currentValue = answer
    ? answer.prob
    : getDisplayProbability(contract as BinaryContract | StonkContract)

  const xScale = scaleLinear().domain([0, 1]).range([0, width])
  const yScale = scaleLinear().domain([0, maxAmount]).range([height, 0])

  const yAxis = axisRight<number>(yScale).ticks(8).tickFormat(formatLargeNumber)
  const xAxis = axisBottom<number>(xScale).ticks(6).tickFormat(formatPct)

  if (yesData.length === 0 || noData.length === 0) {
    return null
  }

  const yesColor = pseudonym?.YES?.pseudonymColor ?? '#11b981'
  const noColor = pseudonym?.NO?.pseudonymColor ?? '#ef4444'

  return (
    <SVGChart w={width} h={height} xAxis={xAxis} yAxis={yAxis} noWatermark>
      <AreaWithTopStroke
        color={getColor(yesColor)}
        data={yesData}
        px={(p) => xScale(p.x)}
        py0={yScale(0)}
        py1={(p) => yScale(p.y)}
        curve={curveStepAfter}
      />
      <AreaWithTopStroke
        color={getColor(noColor)}
        data={noData}
        px={(p) => xScale(p.x)}
        py0={yScale(0)}
        py1={(p) => yScale(p.y)}
        curve={curveStepAfter}
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
// The y value accumulates each order's amount.
// Note this means YES bets are in reverse probability order
function cumulative(bets: LimitBet[]): HistoryPoint[] {
  const result: HistoryPoint[] = []
  let totalAmount = 0

  for (const bet of bets) {
    totalAmount += orderSize(bet)
    result.push({ x: bet.limitProb, y: totalAmount })
  }

  return result
}

function orderSize(bet: LimitBet) {
  const price = bet.outcome === 'YES' ? bet.limitProb : 1 - bet.limitProb
  return (bet.orderAmount - bet.amount) / price
}
