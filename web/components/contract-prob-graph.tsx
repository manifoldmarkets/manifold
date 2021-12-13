import { DatumValue } from '@nivo/core'
import { ResponsiveLine } from '@nivo/line'
import dayjs from 'dayjs'
import { useBets } from '../hooks/use-bets'
import { Contract } from '../lib/firebase/contracts'

export function ContractProbGraph(props: { contract: Contract }) {
  const { contract } = props
  const { id, seedAmounts } = contract

  let bets = useBets(id)
  if (bets === 'loading') bets = []

  const seedProb =
    seedAmounts.YES ** 2 / (seedAmounts.YES ** 2 + seedAmounts.NO ** 2)

  const times = [
    contract.createdTime,
    ...bets.map((bet) => bet.createdTime),
  ].map((time) => new Date(time))
  const probs = [seedProb, ...bets.map((bet) => bet.probAfter)]
  const points = probs.map((prob, i) => ({ x: times[i], y: prob * 100 }))
  const data = [{ id: 'Yes', data: points, color: '#11b981' }]

  const lessThanAWeek =
    times[times.length - 1].getTime() - times[0].getTime() <
    1000 * 60 * 60 * 24 * 7

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
        xScale={{ type: 'time' }}
        xFormat={(d) => formatTime(+d.valueOf(), lessThanAWeek)}
        axisBottom={{
          format: (time) => formatTime(+time, lessThanAWeek),
        }}
        colors={{ datum: 'color' }}
        pointSize={10}
        pointBorderWidth={1}
        pointBorderColor="#fff"
        enableSlices="x"
        enableArea
        margin={{ top: 20, right: 22, bottom: 22, left: 40 }}
      />
    </div>
  )
}

function formatPercent(y: DatumValue) {
  return `${Math.round(+y.toString())}%`
}

function formatTime(time: number, includeTime: boolean) {
  const d = dayjs(time)

  if (d.isSame(Date.now(), 'day')) return d.format('ha')

  if (includeTime) return dayjs(time).format('MMM D, ha')

  return dayjs(time).format('MMM D')
}
