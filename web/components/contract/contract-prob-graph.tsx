import { DatumValue } from '@nivo/core'
import { ResponsiveLine, SliceTooltipProps } from '@nivo/line'
import { BasicTooltip } from '@nivo/tooltip'
import dayjs from 'dayjs'
import { memo } from 'react'
import { Bet } from 'common/bet'
import { getInitialProbability } from 'common/calculate'
import { BinaryContract } from 'common/contract'
import { useWindowSize } from 'web/hooks/use-window-size'

export const ContractProbGraph = memo(function ContractProbGraph(props: {
  contract: BinaryContract
  bets: Bet[]
  height?: number
}) {
  const { contract, height } = props
  const { resolutionTime, closeTime } = contract

  const bets = props.bets.filter((bet) => !bet.isAnte && !bet.isRedemption)

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

  // Add a fake datapoint so the line continues to the right
  times.push(latestTime.toDate())
  probs.push(probs[probs.length - 1])

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
      className="w-full overflow-visible"
      style={{ height: height ?? (!width || width >= 800 ? 350 : 250) }}
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
        xFormat={(d) => formatTooltipTime(+d.valueOf())}
        axisBottom={{
          tickValues: numXTickValues,
          format: (time) => formatTime(+time, lessThanAWeek),
        }}
        colors={{ datum: 'color' }}
        curve="stepAfter"
        pointSize={0}
        pointBorderWidth={1}
        pointBorderColor="#fff"
        enableSlices="x"
        enableGridX={!!width && width >= 800}
        enableArea
        margin={{ top: 20, right: 20, bottom: 25, left: 40 }}
        animate={false}
        sliceTooltip={SliceTooltip}
      />
    </div>
  )
})

const SliceTooltip = ({ slice }: SliceTooltipProps) => {
  return (
    <BasicTooltip
      id={slice.points.map((point) => [
        <span key="date">
          <strong>{point.data[`yFormatted`]}</strong>
          <br></br>
          {point.data['xFormatted']}
        </span>,
      ])}
    />
  )
}

function formatPercent(y: DatumValue) {
  return `${Math.round(+y.toString())}%`
}

function formatTooltipTime(time: number) {
  const d = dayjs(time)

  if (d.add(1, 'minute').isAfter(Date.now())) return 'Now'

  if (d.isSame(Date.now(), 'day') || d.add(2, 'hour').isAfter(Date.now()))
    return dayjs(time).format('h:mma')

  if (d.add(36, 'hour').isAfter(Date.now())) return d.format('MMM D ha')

  if (d.isSame(Date.now(), 'year')) return dayjs(time).format('MMM D')

  return dayjs(time).format('MMM D, YYYY')
}

function formatTime(time: number, includeTime: boolean) {
  const d = dayjs(time)

  if (d.isSame(Date.now(), 'day')) return d.format('ha')

  if (includeTime) return dayjs(time).format('MMM D, ha')

  return dayjs(time).format('MMM D')
}
