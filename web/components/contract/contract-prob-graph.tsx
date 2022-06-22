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

  const yTickValues = [0, 25, 50, 75, 100]

  const { width } = useWindowSize()

  const numXTickValues = !width || width < 800 ? 2 : 5
  const hoursAgo = latestTime.subtract(5, 'hours')
  const startDate = dayjs(times[0]).isBefore(hoursAgo)
    ? times[0]
    : hoursAgo.toDate()

  // Minimum number of points for the graph to have. For smooth tooltip movement
  // On first load, width is undefined, skip adding extra points to let page load faster
  // This fn runs again once DOM is finished loading
  const totalPoints = width ? (width > 800 ? 300 : 50) : 1

  const timeStep: number = latestTime.diff(startDate, 'ms') / totalPoints
  const points: { x: Date; y: number }[] = []
  for (let i = 0; i < times.length; i++) {
    points[points.length] = { x: times[i], y: probs[i] * 100 }
    const numPoints: number = Math.floor(
      dayjs(times[i + 1]).diff(dayjs(times[i]), 'ms') / timeStep
    )
    if (numPoints > 1) {
      const thisTimeStep: number =
        dayjs(times[i + 1]).diff(dayjs(times[i]), 'ms') / numPoints
      for (let n = 1; n < numPoints; n++) {
        points[points.length] = {
          x: dayjs(times[i])
            .add(thisTimeStep * n, 'ms')
            .toDate(),
          y: probs[i] * 100,
        }
      }
    }
  }

  const data = [{ id: 'Yes', data: points, color: '#11b981' }]

  const multiYear = !dayjs(startDate).isSame(latestTime, 'year')
  const lessThanAWeek = dayjs(startDate).add(8, 'day').isAfter(latestTime)

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
        xFormat={(d) =>
          formatTime(+d.valueOf(), multiYear, lessThanAWeek, lessThanAWeek)
        }
        axisBottom={{
          tickValues: numXTickValues,
          format: (time) => formatTime(+time, multiYear, lessThanAWeek, false),
        }}
        colors={{ datum: 'color' }}
        curve="stepAfter"
        enablePoints={false}
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
          <strong>{point.data[`yFormatted`]}</strong> {point.data['xFormatted']}
        </span>,
      ])}
    />
  )
}

function formatPercent(y: DatumValue) {
  return `${Math.round(+y.toString())}%`
}

function formatTime(
  time: number,
  includeYear: boolean,
  includeHour: boolean,
  includeMinute: boolean
) {
  const d = dayjs(time)

  if (d.add(1, 'minute').isAfter(Date.now())) return 'Now'

  let format: string
  if (d.isSame(Date.now(), 'day')) {
    format = '[Today]'
  } else if (d.add(1, 'day').isSame(Date.now(), 'day')) {
    format = '[Yesterday]'
  } else {
    format = 'MMM D'
  }

  if (includeMinute) {
    format += ', h:mma'
  } else if (includeHour) {
    format += ', ha'
  } else if (includeYear) {
    format += ', YYYY'
  }

  return d.format(format)
}
