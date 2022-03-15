import { DatumValue } from '@nivo/core'
import { ResponsiveLine } from '@nivo/line'
import dayjs from 'dayjs'
import { Bet } from '../../common/bet'
import { getInitialProbability } from '../../common/calculate'
import { Binary, CPMM, DPM, FullContract } from '../../common/contract'
import { useBetsWithoutAntes } from '../hooks/use-bets'
import { useWindowSize } from '../hooks/use-window-size'

export function ContractProbGraph(props: {
  contract: FullContract<DPM | CPMM, Binary>
  bets: Bet[]
}) {
  const { contract } = props
  const { resolutionTime, closeTime } = contract

  const bets = useBetsWithoutAntes(contract, props.bets).filter(
    (b) => !b.isRedemption
  )

  const startProb = getInitialProbability(contract)

  const times = [
    contract.createdTime,
    ...bets.map((bet) => bet.createdTime),
  ].map((time) => new Date(time))
  const probs = [startProb, ...bets.map((bet) => bet.probAfter)]

  const isClosed = !!closeTime && Date.now() > closeTime
  const latestTime = dayjs(
    resolutionTime && isClosed
      ? Math.min(resolutionTime, closeTime)
      : isClosed
      ? closeTime
      : resolutionTime ?? Date.now()
  )

  if (resolutionTime || isClosed) {
    times.push(latestTime.toDate())
    probs.push(probs[probs.length - 1])
  } else {
    // Add a fake datapoint in future so the line continues horizontally
    // to the right.
    times.push(latestTime.add(1, 'month').toDate())
    probs.push(probs[probs.length - 1])
  }

  const points = probs.map((prob, i) => ({ x: times[i], y: prob * 100 }))
  const data = [{ id: 'Yes', data: points, color: '#11b981' }]

  const yTickValues = [0, 25, 50, 75, 100]

  const { width } = useWindowSize()

  const numXTickValues = !width || width < 800 ? 2 : 5
  const hoursAgo = latestTime.subtract(5, 'hours')
  const startDate = dayjs(times[0]).isBefore(hoursAgo)
    ? times[0]
    : hoursAgo.toDate()

  const lessThanAWeek = dayjs(startDate).add(1, 'week').isAfter(latestTime)

  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: !width || width >= 800 ? 400 : 250 }}
    >
      <ResponsiveLine
        data={data}
        yScale={{ min: 0, max: 100, type: 'linear' }}
        yFormat={formatPercent}
        gridYValues={yTickValues}
        axisLeft={{
          tickValues: yTickValues,
          format: formatPercent,
        }}
        xScale={{
          type: 'time',
          min: startDate,
          max: latestTime.toDate(),
        }}
        xFormat={(d) => formatTime(+d.valueOf(), lessThanAWeek)}
        axisBottom={{
          tickValues: numXTickValues,
          format: (time) => formatTime(+time, lessThanAWeek),
        }}
        colors={{ datum: 'color' }}
        pointSize={bets.length > 100 ? 0 : 10}
        pointBorderWidth={1}
        pointBorderColor="#fff"
        enableSlices="x"
        enableGridX={!!width && width >= 800}
        enableArea
        margin={{ top: 20, right: 28, bottom: 22, left: 40 }}
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
