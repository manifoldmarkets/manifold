import { DatumValue } from '@nivo/core'
import { ResponsiveLine } from '@nivo/line'
import { useBets } from '../hooks/use-bets'
import { Contract } from '../lib/firebase/contracts'

export function ContractProbGraph(props: { contract: Contract }) {
  const { contract } = props
  const { id, seedAmounts } = contract

  let bets = useBets(id)
  if (bets === 'loading') bets = []

  const seedProb =
    seedAmounts.YES ** 2 / (seedAmounts.YES ** 2 + seedAmounts.NO ** 2)

  const probs = [seedProb, ...bets.map((bet) => bet.probAfter)]
  const points = probs.map((prob, i) => ({ x: i + 1, y: prob * 100 }))
  const data = [{ id: 'Yes', data: points, color: '#11b981' }]

  const tickValues = [0, 25, 50, 75, 100]

  return (
    <div className="w-full" style={{ height: 400 }}>
      <ResponsiveLine
        data={data}
        yScale={{ min: 0, max: 100, type: 'linear' }}
        yFormat={formatPercent}
        gridYValues={tickValues}
        axisLeft={{
          tickValues,
          format: formatPercent,
        }}
        axisBottom={{
          tickValues: [],
        }}
        enableGridX={false}
        colors={{ datum: 'color' }}
        pointSize={12}
        pointBorderWidth={2}
        pointBorderColor="#fff"
        enableSlices="x"
        enableArea
        margin={{ top: 20, right: 10, bottom: 20, left: 40 }}
      />
    </div>
  )
}

function formatPercent(y: DatumValue) {
  return `${Math.round(+y.toString())}%`
}
