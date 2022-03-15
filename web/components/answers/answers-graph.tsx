import { DatumValue } from '@nivo/core'
import { ResponsiveLine } from '@nivo/line'
import dayjs from 'dayjs'
import _ from 'lodash'

import { Bet } from '../../../common/bet'
import { Contract } from '../../../common/contract'
import { getOutcomeProbability } from '../../../common/calculate'
import { useBets } from '../../hooks/use-bets'
import { useWindowSize } from '../../hooks/use-window-size'

export function AnswersGraph(props: { contract: Contract; bets: Bet[] }) {
  const { contract } = props
  const { resolutionTime, closeTime, answers } = contract

  const bets = (useBets(contract.id) ?? props.bets).filter((bet) => !bet.sale)
  const betsByOutcome = _.groupBy(bets, (bet) => bet.outcome)

  const isClosed = !!closeTime && Date.now() > closeTime
  const latestTime = dayjs(
    resolutionTime && isClosed
      ? Math.min(resolutionTime, closeTime)
      : isClosed
      ? closeTime
      : resolutionTime ?? Date.now()
  )

  const outcomes = Object.keys(betsByOutcome).filter((outcome) => {
    const maxProb = Math.max(
      ...betsByOutcome[outcome].map((bet) => bet.probAfter)
    )
    return outcome !== '0' && maxProb > 0.05
  })

  const { width } = useWindowSize()

  const labelLength = !width || width > 800 ? 75 : 20

  const sortedOutcomes = _.sortBy(
    outcomes,
    (outcome) => -1 * getOutcomeProbability(totalShares, outcome)
  ).slice(0, 5)

  const colors = ['#2a81e3', '#c72ae3', '#b91111', '#f3ad28', '#11b981']

  const times = _.sortBy(bets.map((bet) => bet.createdTime))
  const porbs = []
  const totalShares = { '0': contract.totalShares['0'] }
  for (const bet of bets) {
  }

  const dateTimes = times.map((time) => new Date(time))

  const data = sortedOutcomes.map((outcome, i) => {
    const bets = _.sortBy(betsByOutcome[outcome], (bet) => bet.createdTime)

    const probs: number[] = []
    let betIndex: number = 0
    for (const time of times) {
      if (betIndex === bets.length) probs.push(bets[betIndex - 1].probAfter)
      else if (time < bets[betIndex].createdTime) {
        probs.push(betIndex === 0 ? 0 : bets[betIndex - 1].probAfter)
      } else {
        probs.push(bets[betIndex].probAfter)
        betIndex++
      }
    }

    if (resolutionTime || isClosed) {
      dateTimes.push(latestTime.toDate())
      probs.push(probs[probs.length - 1])
    } else {
      // Add a fake datapoint in future so the line continues horizontally
      // to the right.
      dateTimes.push(latestTime.add(1, 'month').toDate())
      probs.push(probs[probs.length - 1])
    }

    const points = probs.map((prob, i) => ({
      x: dateTimes[i],
      y: prob * 100,
    }))

    const answer =
      answers?.find((answer) => answer.id === outcome)?.text ?? 'None'

    const answerText =
      answer.slice(0, labelLength) + (answer.length > labelLength ? '...' : '')
    return { id: answerText, data: points, color: colors[i] }
  })

  data.reverse()

  const yTickValues = [0, 25, 50, 75, 100]

  const numXTickValues = !width || width < 800 ? 2 : 5
  const hoursAgo = latestTime.subtract(5, 'hours')
  const startDate = dayjs(contract.createdTime).isBefore(hoursAgo)
    ? new Date(contract.createdTime)
    : hoursAgo.toDate()

  const lessThanAWeek = dayjs(startDate).add(1, 'week').isAfter(latestTime)

  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: !width || width >= 800 ? 350 : 250 }}
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
        pointSize={0}
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
