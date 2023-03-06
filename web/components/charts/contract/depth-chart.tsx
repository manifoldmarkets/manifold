import {
  VictoryChart,
  VictoryGroup,
  VictoryArea,
  VictoryLine,
  VictoryAxis,
  VictoryLabel,
} from 'victory'
import { LimitBet } from 'common/bet'
import { CPMMBinaryContract, PseudoNumericContract } from 'common/contract'
import { getDisplayProbability } from 'common/calculate'
import { Col } from '../../layout/col'
import { useIsDarkMode } from 'web/hooks/dark-mode-context'

export function DepthChart(props: {
  contract: CPMMBinaryContract | PseudoNumericContract
  yesBets: LimitBet[]
  noBets: LimitBet[]
}) {
  const { contract, yesBets, noBets } = props

  const isDarkMode = useIsDarkMode()

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
  let minX = yesData[yesData.length - 1].x
  let maxX = noData[noData.length - 1].x
  const xRange = maxX - minX
  minX -= xRange * 0.1
  if (minX < 0) {
    minX = 0
  }
  maxX += xRange * 0.1
  if (maxX > 1) {
    maxX = 1
  }
  yesData.unshift({ x: minX, y: yesData[0].y })
  noData.push({ x: maxX, y: noData[noData.length - 1].y })

  const currentValue = getDisplayProbability(contract)

  const strokeColor = isDarkMode ? 'white' : 'black'
  const axisStyle = {
    axis: {
      stroke: strokeColor,
    },
    tickLabels: {
      fill: strokeColor,
    },
  }

  return (
    <Col>
      <h2 className="text-ink-1000 self-center text-sm">Market depth</h2>
      <VictoryChart
        minDomain={{ x: minX, y: 0 }}
        maxDomain={{ x: maxX, y: maxAmount }}
        padding={{ top: 50, bottom: 50, left: 100, right: 50 }}
        domainPadding={30}
      >
        <VictoryAxis
          tickFormat={(t) => `${Math.round(t * 100)}%`}
          tickCount={10}
          label="Chance"
          axisLabelComponent={<VictoryLabel dy={10} />}
          style={axisStyle}
        />
        <VictoryAxis
          tickFormat={(t) => `M${Math.round(t)}`}
          tickCount={6}
          dependentAxis={true}
          axisLabelComponent={<VictoryLabel dy={-30} />}
          label={'Amount'}
          style={axisStyle}
        />
        <VictoryGroup
          style={{
            data: { strokeWidth: 1, fillOpacity: 0.4 },
          }}
        >
          {/* // Line that shows the current value */}
          <VictoryLine
            style={{
              // Indigo
              data: { stroke: 'rgb(99 102 241)' },
            }}
            data={[
              { x: currentValue, y: 0 },
              { x: currentValue, y: maxAmount },
            ]}
          />
          {/* First vertical line of the "yes" bets */}
          <VictoryLine
            style={{
              data: { stroke: '#059669' },
            }}
            data={[
              { x: yesData[yesData.length - 1].x, y: 0 },
              {
                x: yesData[yesData.length - 1].x,
                y: yesData[yesData.length - 1].y,
              },
            ]}
          />
          {/* First vertical line of the "no" bets */}
          <VictoryLine
            style={{
              data: { stroke: 'red' },
            }}
            data={[
              { x: noData[0].x, y: 0 },
              { x: noData[0].x, y: noData[0].y },
            ]}
          />
          {/* // Area that shows the yes bets */}
          <VictoryArea
            style={{
              data: { fill: '#6EE7B7', stroke: '#059669' },
            }}
            data={yesData}
            interpolation="stepBefore"
          />
          {/* // Area that shows the no bets */}
          <VictoryArea
            style={{
              data: { fill: 'red', stroke: 'red' },
            }}
            data={noData}
            interpolation="stepAfter"
          />
        </VictoryGroup>
      </VictoryChart>
    </Col>
  )
}

type Coordinate = { x: number; y: number }

// Converts a list of LimitBets into a list of coordinates to render into a depth chart.
// Going in order of probability, the y value accumulates each order's amount.
function cumulative(bets: LimitBet[]): Coordinate[] {
  const result: Coordinate[] = []
  let totalAmount = 0

  for (let i = 0; i < bets.length; i++) {
    totalAmount += bets[i].orderAmount
    result.push({ x: bets[i].limitProb, y: totalAmount })
  }

  return result
}
