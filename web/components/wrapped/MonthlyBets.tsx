import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { MonthlyBetsType } from 'web/hooks/use-wrapped-2023'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { numberWithCommas } from 'web/lib/util/formatNumber'
import { Spacer } from '../layout/spacer'
import { MONTHS } from './GeneralStats'
import { NavButtons } from './NavButtons'

export function MonthlyBets(props: {
  goToPrevPage: () => void
  goToNextPage: () => void
  monthlyBets: MonthlyBetsType[] | undefined | null
}) {
  const { goToPrevPage, goToNextPage, monthlyBets } = props
  const animateCircleIn = true
  const [animateTotalBetIn, setAnimateTotalBetIn] = useState(false)
  const [animateMostMonthBetIn, setAnimateMostMonthBetIn] = useState(false)
  const [animateOut, setAnimateOut] = useState(false)

  //triggers for animation in
  useEffect(() => {
    if (!animateCircleIn) return
    const timeout1 = setTimeout(() => {
      setAnimateTotalBetIn(true)
    }, 1000)
    const timeout2 = setTimeout(() => {
      setAnimateMostMonthBetIn(true)
    }, 3000)
    const timeout3 = setTimeout(() => {
      onGoToNext()
    }, 6000)
    return () => {
      clearTimeout(timeout1)
      clearTimeout(timeout2)
      clearTimeout(timeout3)
    }
  }, [animateCircleIn])

  const onGoToNext = () => {
    setAnimateOut(true)
    setTimeout(() => {
      goToNextPage()
    }, 1000)
  }

  if (monthlyBets == undefined) {
    return (
      <div className="mx-auto my-auto">
        <LoadingIndicator />
      </div>
    )
  }
  const totalBetsThisYear = monthlyBets.reduce((accumulator, current) => {
    return accumulator + current.bet_count
  }, 0)
  if (monthlyBets == null) {
    return <>An error occured</>
  }

  const monthWithMaxBets = monthlyBets.reduce((max, current) => {
    return current.bet_count > max.bet_count ? current : max
  })
  // Create a date object using the UTC constructor to prevent timezone offsets from affecting the month
  const dateOfMaxBets = new Date(monthWithMaxBets.month)
  dateOfMaxBets.setDate(dateOfMaxBets.getDate() + 1)

  // Now you have the month with the highest number of bets
  const monthName = dateOfMaxBets.toLocaleString('default', {
    month: 'long',
    timeZone: 'UTC',
  })

  return (
    <>
      <div className="relative mx-auto my-auto max-w-lg">
        <div
          className={clsx(
            'ml-4 sm:ml-20',
            animateOut
              ? 'animate-slide-right-out'
              : animateCircleIn && 'animate-slide-right-in'
          )}
        >
          <CircleGraph
            monthlyBets={monthlyBets}
            maxBets={monthWithMaxBets.bet_count}
          />
        </div>
        <div
          className={clsx(
            'px-6 text-2xl',
            animateTotalBetIn
              ? animateOut
                ? 'animate-fade-out'
                : 'animate-fade-in'
              : 'invisible'
          )}
        >
          You've bet a total of{' '}
          <span className="font-bold text-fuchsia-300">
            {numberWithCommas(totalBetsThisYear)}
          </span>{' '}
          times this year!
        </div>
        <Spacer h={4} />
        <div
          className={clsx(
            'px-6 text-2xl ',
            animateMostMonthBetIn
              ? animateOut
                ? 'animate-fade-out'
                : 'animate-fade-in'
              : 'invisible'
          )}
        >
          You bet the most in{' '}
          <span className={clsx('highlight-black font-bold text-fuchsia-300')}>
            {monthName}
          </span>
          , with{' '}
          <span className="font-bold text-fuchsia-300">
            {numberWithCommas(monthWithMaxBets.bet_count)}
          </span>{' '}
          bets!
        </div>
      </div>
      <NavButtons goToPrevPage={goToPrevPage} goToNextPage={onGoToNext} />
    </>
  )
}

export const CircleGraph = (props: {
  monthlyBets: MonthlyBetsType[]
  maxBets: number
}) => {
  const { monthlyBets, maxBets } = props
  const radius = 100 // Radius of the circle
  const maxLength = 50 // Maximum length of the spikes
  const svgPadding = 20
  const svgSize = (radius + maxLength + svgPadding) * 2
  const svgCenter = svgSize / 4

  // Calculate the scale factor
  const scaleFactor = maxBets > 0 ? maxLength / maxBets : 0
  const numMonths = monthlyBets.length
  return (
    <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
      <defs>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="blue" />
          <stop offset="100%" stopColor="red" />
        </linearGradient>
      </defs>

      {/* Draw the lines for each month */}
      {monthlyBets.map((data, index) => {
        const angle = (index / numMonths) * Math.PI * 2 - Math.PI / 2 // -90 degrees to start from top
        const lineLength = data.bet_count * scaleFactor
        const x1 = svgCenter + radius + radius * Math.cos(angle)
        const y1 = svgCenter + radius + radius * Math.sin(angle)
        const x2 = x1 + lineLength * Math.cos(angle)
        const y2 = y1 + lineLength * Math.sin(angle)

        return (
          <line
            key={index}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={getScaleColor(lineLength)} // Apply the gradient to the stroke
            strokeWidth="50"
          />
        )
      })}

      {/* Label the months */}
      {monthlyBets.map((_data, index) => {
        const angle = (index / numMonths) * Math.PI * 2 - Math.PI / 2
        const textRadius = radius - 10 // Place text inside the circle
        const x = svgCenter + radius + textRadius * Math.cos(angle)
        const y = svgCenter + radius + textRadius * Math.sin(angle)

        return (
          <text
            key={index}
            x={x}
            y={y}
            dy="0.35em"
            textAnchor="middle"
            fontSize="14"
            fill="#a28ea4"
            transform={`rotate(${index * (360 / numMonths)} ${x} ${y})`} // This will rotate the text to be upright
          >
            {MONTHS[index]}
          </text>
        )
      })}
    </svg>
  )
}

function getScaleColor(scaledNum: number) {
  if (scaledNum < 20) {
    return '#22d3ee'
  }
  if (scaledNum < 40) {
    return '#67e8f9'
  }
  if (scaledNum < 60) {
    return '#a5f3fc'
  }
  if (scaledNum < 80) {
    return '#cffafe'
  } else {
    return '#ecfeff'
  }
}
