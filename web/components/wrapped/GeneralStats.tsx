import clsx from 'clsx'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import { MonthlyBetsType } from 'web/hooks/use-wrapped-2024'
import { Spacer } from '../layout/spacer'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { NavButtons } from './NavButtons'

export function GeneralStats(props: {
  monthlyBets: MonthlyBetsType[] | undefined | null
  goToPrevPage: () => void
  goToNextPage: () => void
  user: User
}) {
  const { goToPrevPage, goToNextPage, monthlyBets } = props
  const animateTotalSpentIn = true
  const [animateMostSpentIn, setAnimateMostSpentIn] = useState(false)
  const [animateGraphicIn, setAnimateGraphicIn] = useState(false)
  const [animateOut, setAnimateOut] = useState(false)

  //triggers for animation in
  useEffect(() => {
    if (!animateTotalSpentIn) return
    const timeout1 = setTimeout(() => {
      setAnimateMostSpentIn(true)
    }, 1500)
    const timeout2 = setTimeout(() => {
      setAnimateGraphicIn(true)
    }, 3000)
    const timeout3 = setTimeout(() => {
      onGoToNext()
    }, 6000)
    return () => {
      clearTimeout(timeout1)
      clearTimeout(timeout2)
      clearTimeout(timeout3)
    }
  }, [animateTotalSpentIn])

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
  const amountBetThisYear = monthlyBets.reduce((accumulator, current) => {
    return accumulator + current.total_amount
  }, 0)

  if (monthlyBets == null) {
    return <>An error occured</>
  }

  const monthWithMostBet = monthlyBets.reduce((max, current) => {
    return current.total_amount > max.total_amount ? current : max
  })
  // Create a date object using the UTC constructor to prevent timezone offsets from affecting the month
  const dateOfMostBet = new Date(monthWithMostBet.month)
  dateOfMostBet.setDate(dateOfMostBet.getDate() + 1)

  // Now you have the month with the highest number of bets
  const monthName = dateOfMostBet.toLocaleString('default', {
    month: 'long',
    timeZone: 'UTC',
  })

  return (
    <>
      <div className="relative mx-auto my-auto max-w-lg overflow-hidden">
        <div
          className={clsx(
            'px-4 text-2xl',
            animateOut ? 'animate-fade-out' : 'animate-fade-in'
          )}
        >
          This year you spent{' '}
          <span className="font-bold text-green-300">
            {formatMoney(amountBetThisYear)}
          </span>{' '}
          betting on things you believed in!
        </div>
        <Spacer h={4} />
        <div
          className={clsx(
            'px-4 text-2xl ',
            animateMostSpentIn
              ? animateOut
                ? 'animate-fade-out'
                : 'animate-fade-in'
              : 'invisible'
          )}
        >
          You bet the most in{' '}
          <span className={clsx('highlight-black font-bold text-green-300')}>
            {monthName}
          </span>
          , spending{' '}
          <span className="font-bold text-green-300">
            {formatMoney(monthWithMostBet.total_amount)}
          </span>{' '}
          mana!
        </div>
        <div
          className={clsx(
            animateGraphicIn
              ? animateOut
                ? 'animate-slide-right-out'
                : 'animate-slide-right-in'
              : 'invisible'
          )}
        >
          <CoinBarChart data={monthlyBets} />
        </div>
      </div>
      <NavButtons goToPrevPage={goToPrevPage} goToNextPage={onGoToNext} />
    </>
  )
}

const CoinBarChart = (props: { data: MonthlyBetsType[] }) => {
  const { data } = props
  const svgWidth = 280
  const svgHeight = 350
  const maxCoins = 20 // Maximum number of coins in a stack
  const coinWidth = 9 // Width of the oval (coin)
  const coinHeight = 3 // Height of the oval (coin)
  const spacing = 35 // Horizontal spacing between stacks
  const rowSpacing = svgHeight / 3 // Vertical spacing between rows

  const maxManaBet = Math.max(...data.map((item) => item.total_amount))
  const scaleFactor = maxManaBet > 0 ? maxCoins / maxManaBet : 1

  return (
    <div className="ml-6 sm:ml-20">
      <svg width={svgWidth} height={svgHeight}>
        {data.map((item, index) => {
          const coinsInStack = Math.round(item.total_amount * scaleFactor)
          const isTopRow = index < 6 // First 6 months (Jan-Jun) are in the top row
          const rowIndex = isTopRow ? index : index - 6 // Adjust index for each row
          const xPosition = (svgWidth / 6) * rowIndex + spacing // X position of each stack
          const yBasePosition = isTopRow ? rowSpacing : rowSpacing * 2 // Y base position for each row

          return (
            <g key={index}>
              {/* Stack of coins */}
              {Array.from({ length: coinsInStack }).map((_, coinIndex) => {
                const yPosition = yBasePosition - (coinIndex * coinHeight + 30)
                return (
                  <ellipse
                    key={coinIndex}
                    cx={xPosition}
                    cy={yPosition}
                    rx={coinWidth}
                    ry={coinHeight}
                    fill="gold" // Change color as needed
                    stroke="#92400e"
                    strokeWidth="1"
                  />
                )
              })}
              {/* Month label */}
              <text
                x={xPosition - coinWidth}
                y={yBasePosition}
                fill="white"
                fontSize="12"
              >
                {MONTHS[index]}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'June',
  'July',
  'Aug',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
]
