import { DatumValue } from '@nivo/core'
import { ResponsiveLine } from '@nivo/line'
import dayjs from 'dayjs'
import { groupBy, sortBy, sumBy } from 'lodash'
import { memo } from 'react'

import { Bet } from 'common/bet'
import { FreeResponseContract, MultipleChoiceContract } from 'common/contract'
import { getOutcomeProbability } from 'common/calculate'
import { useWindowSize } from 'web/hooks/use-window-size'

const NUM_LINES = 6

export const AnswersGraph = memo(function AnswersGraph(props: {
  contract: FreeResponseContract | MultipleChoiceContract
  bets: Bet[]
  height?: number
}) {
  const { contract, bets, height } = props
  const { createdTime, resolutionTime, closeTime, answers } = contract
  const now = Date.now()

  const { probsByOutcome, sortedOutcomes } = computeProbsByOutcome(
    bets,
    contract
  )

  const isClosed = !!closeTime && now > closeTime
  const latestTime = dayjs(
    resolutionTime && isClosed
      ? Math.min(resolutionTime, closeTime)
      : isClosed
      ? closeTime
      : resolutionTime ?? now
  )

  const { width } = useWindowSize()

  const isLargeWidth = !width || width > 800
  const labelLength = isLargeWidth ? 50 : 20

  // Add a fake datapoint so the line continues to the right
  const endTime = latestTime.valueOf()

  const times = sortBy([
    createdTime,
    ...bets.map((bet) => bet.createdTime),
    endTime,
  ])
  const dateTimes = times.map((time) => new Date(time))

  const data = sortedOutcomes.map((outcome) => {
    const betProbs = probsByOutcome[outcome]
    // Add extra point for contract start and end.
    const probs = [0, ...betProbs, betProbs[betProbs.length - 1]]

    const points = probs.map((prob, i) => ({
      x: dateTimes[i],
      y: Math.round(prob * 100),
    }))

    const answer =
      answers?.find((answer) => answer.id === outcome)?.text ?? 'None'
    const answerText =
      answer.slice(0, labelLength) + (answer.length > labelLength ? '...' : '')

    return { id: answerText, data: points }
  })

  data.reverse()

  const yTickValues = [0, 25, 50, 75, 100]

  const numXTickValues = isLargeWidth ? 5 : 2
  const startDate = dayjs(contract.createdTime)
  const endDate = startDate.add(1, 'hour').isAfter(latestTime)
    ? latestTime.add(1, 'hours')
    : latestTime
  const includeMinute = endDate.diff(startDate, 'hours') < 2

  const multiYear = !startDate.isSame(latestTime, 'year')
  const lessThanAWeek = startDate.add(1, 'week').isAfter(latestTime)

  return (
    <div
      className="w-full"
      style={{ height: height ?? (isLargeWidth ? 350 : 250) }}
    >
      <ResponsiveLine
        data={data}
        yScale={{ min: 0, max: 100, type: 'linear', stacked: true }}
        yFormat={formatPercent}
        gridYValues={yTickValues}
        axisLeft={{
          tickValues: yTickValues,
          format: formatPercent,
        }}
        xScale={{
          type: 'time',
          min: startDate.toDate(),
          max: endDate.toDate(),
        }}
        xFormat={(d) =>
          formatTime(now, +d.valueOf(), multiYear, lessThanAWeek, lessThanAWeek)
        }
        axisBottom={{
          tickValues: numXTickValues,
          format: (time) =>
            formatTime(now, +time, multiYear, lessThanAWeek, includeMinute),
        }}
        colors={[
          '#fca5a5', // red-300
          '#a5b4fc', // indigo-300
          '#86efac', // green-300
          '#fef08a', // yellow-200
          '#fdba74', // orange-300
          '#c084fc', // purple-400
        ]}
        pointSize={0}
        curve="stepAfter"
        enableSlices="x"
        enableGridX={!!width && width >= 800}
        enableArea
        areaOpacity={1}
        margin={{ top: 20, right: 20, bottom: 25, left: 40 }}
        legends={[
          {
            anchor: 'top-left',
            direction: 'column',
            justify: false,
            translateX: isLargeWidth ? 5 : 2,
            translateY: 0,
            itemsSpacing: 0,
            itemTextColor: 'black',
            itemDirection: 'left-to-right',
            itemWidth: isLargeWidth ? 288 : 138,
            itemHeight: 20,
            itemBackground: 'white',
            itemOpacity: 0.9,
            symbolSize: 12,
            effects: [
              {
                on: 'hover',
                style: {
                  itemBackground: 'rgba(255, 255, 255, 1)',
                  itemOpacity: 1,
                },
              },
            ],
          },
        ]}
      />
    </div>
  )
})

function formatPercent(y: DatumValue) {
  return `${Math.round(+y.toString())}%`
}

function formatTime(
  now: number,
  time: number,
  includeYear: boolean,
  includeHour: boolean,
  includeMinute: boolean
) {
  const d = dayjs(time)
  if (d.add(1, 'minute').isAfter(now) && d.subtract(1, 'minute').isBefore(now))
    return 'Now'

  let format: string
  if (d.isSame(now, 'day')) {
    format = '[Today]'
  } else if (d.add(1, 'day').isSame(now, 'day')) {
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

const computeProbsByOutcome = (
  bets: Bet[],
  contract: FreeResponseContract | MultipleChoiceContract
) => {
  const { totalBets, outcomeType } = contract

  const betsByOutcome = groupBy(bets, (bet) => bet.outcome)
  const outcomes = Object.keys(betsByOutcome).filter((outcome) => {
    const maxProb = Math.max(
      ...betsByOutcome[outcome].map((bet) => bet.probAfter)
    )
    return (
      (outcome !== '0' || outcomeType === 'MULTIPLE_CHOICE') &&
      maxProb > 0.02 &&
      totalBets[outcome] > 0.000000001
    )
  })

  const trackedOutcomes = sortBy(
    outcomes,
    (outcome) => -1 * getOutcomeProbability(contract, outcome)
  ).slice(0, NUM_LINES)

  const probsByOutcome = Object.fromEntries(
    trackedOutcomes.map((outcome) => [outcome, [] as number[]])
  )
  const sharesByOutcome = Object.fromEntries(
    Object.keys(betsByOutcome).map((outcome) => [outcome, 0])
  )

  for (const bet of bets) {
    const { outcome, shares } = bet
    sharesByOutcome[outcome] += shares

    const sharesSquared = sumBy(
      Object.values(sharesByOutcome).map((shares) => shares ** 2)
    )

    for (const outcome of trackedOutcomes) {
      probsByOutcome[outcome].push(
        sharesByOutcome[outcome] ** 2 / sharesSquared
      )
    }
  }

  return { probsByOutcome, sortedOutcomes: trackedOutcomes }
}
