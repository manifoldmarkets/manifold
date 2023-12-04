import clsx from 'clsx'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import { MonthlyBetsType, useTotalProfit } from 'web/hooks/use-wrapped-2023'
import { Spacer } from '../layout/spacer'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { NavButtons } from './NavButtons'

export function TotalProfit(props: {
  monthlyBets: MonthlyBetsType[] | undefined | null
  goToPrevPage: () => void
  goToNextPage: () => void
  user: User
}) {
  const { goToPrevPage, goToNextPage, user, monthlyBets } = props
  const [animateIn, setAnimateIn] = useState(true)
  const [animateGrowingIn, setAnimateGrowingIn] = useState(false)
  const [animateOut, setAnimateOut] = useState(false)
  const totalProfit = useTotalProfit(user.id)

  //triggers for animation in
  useEffect(() => {
    if (!animateIn) return
    const timeout1 = setTimeout(() => {
      setAnimateGrowingIn(true)
    }, 1000)
    const timeout2 = setTimeout(() => {
      onGoToNext()
    }, 5000)
    return () => {
      clearTimeout(timeout1)
      clearTimeout(timeout2)
    }
  }, [animateIn])

  const onGoToNext = () => {
    setAnimateOut(true)
    setTimeout(() => {
      goToNextPage()
    }, 1000)
  }

  if (totalProfit == undefined) {
    return <LoadingIndicator />
  }

  if (totalProfit == null) {
    return <>An error occured</>
  }

  return (
    <>
      <div className="relative mx-auto my-auto">
        <div
          className={clsx(
            'px-6 text-2xl',
            animateOut ? 'animate-fade-out' : 'animate-fade-in'
          )}
        >
          On those bets, you made{' '}
          <span
            className={clsx(
              'font-bold ',
              totalProfit < 0 ? 'text-red-300' : 'text-green-300'
            )}
          >
            {formatMoney(totalProfit)}
          </span>
        </div>
        <Spacer h={4} />
        <div
          className={clsx(
            animateGrowingIn
              ? animateOut
                ? 'animate-fade-out'
                : 'animate-grow-up'
              : 'invisible',
            'h-[200px]',
            totalProfit < 0 ? 'bg-red-300' : 'bg-green-300'
          )}
        />
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

function getScaleColor(scaledNum: number) {
  console.log(scaledNum)
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
