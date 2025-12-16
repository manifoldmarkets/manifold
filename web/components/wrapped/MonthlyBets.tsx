import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { MonthlyBetsType } from 'web/hooks/use-wrapped-2025'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { numberWithCommas } from 'common/util/formatNumber'
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
  const dateOfMaxBets = new Date(monthWithMaxBets.month)
  dateOfMaxBets.setDate(dateOfMaxBets.getDate() + 1)

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
            'px-6 text-2xl text-white',
            animateTotalBetIn
              ? animateOut
                ? 'animate-fade-out'
                : 'animate-fade-in'
              : 'invisible'
          )}
        >
          You've traded a total of{' '}
          <span className="font-bold text-green-300">
            {numberWithCommas(totalBetsThisYear)}
          </span>{' '}
          times this year! 🎄
        </div>
        <Spacer h={4} />
        <div
          className={clsx(
            'px-6 text-2xl text-white',
            animateMostMonthBetIn
              ? animateOut
                ? 'animate-fade-out'
                : 'animate-fade-in'
              : 'invisible'
          )}
        >
          You traded the most in{' '}
          <span className="font-bold text-red-300">
            {monthName}
          </span>
          , with{' '}
          <span className="font-bold text-green-300">
            {numberWithCommas(monthWithMaxBets.bet_count)}
          </span>{' '}
          trades! 🎁
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
  const radius = 100
  const maxLength = 50
  const svgPadding = 20
  const svgSize = (radius + maxLength + svgPadding) * 2
  const svgCenter = svgSize / 4

  const scaleFactor = maxBets > 0 ? maxLength / maxBets : 0
  const numMonths = monthlyBets.length
  
  return (
    <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
      <defs>
        <linearGradient id="christmasGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>

      {/* Draw the lines for each month */}
      {monthlyBets.map((data, index) => {
        const angle = (index / numMonths) * Math.PI * 2 - Math.PI / 2
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
            stroke={getChristmasColor(index)}
            strokeWidth="50"
            strokeLinecap="round"
          />
        )
      })}

      {/* Label the months */}
      {monthlyBets.map((_data, index) => {
        const angle = (index / numMonths) * Math.PI * 2 - Math.PI / 2
        const textRadius = radius - 10
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
            fill={index % 2 === 0 ? '#86efac' : '#fca5a5'}
            fontWeight="bold"
            transform={`rotate(${index * (360 / numMonths)} ${x} ${y})`}
          >
            {MONTHS[index]}
          </text>
        )
      })}
      
      {/* Center decoration */}
      <text
        x={svgCenter + radius}
        y={svgCenter + radius}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="40"
      >
        ⭐
      </text>
    </svg>
  )
}

function getChristmasColor(index: number) {
  // Alternate between Christmas red and green with varying shades
  const colors = [
    '#ef4444', // red-500
    '#22c55e', // green-500
    '#dc2626', // red-600
    '#16a34a', // green-600
    '#f87171', // red-400
    '#4ade80', // green-400
    '#b91c1c', // red-700
    '#15803d', // green-700
    '#fca5a5', // red-300
    '#86efac', // green-300
    '#ef4444', // red-500
    '#22c55e', // green-500
  ]
  return colors[index % colors.length]
}
