import clsx from 'clsx'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import {
  MonthlyBetsType,
  ProfitType,
  useMaxAndMinProfit,
} from 'web/hooks/use-wrapped-2023'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { NavButtons } from './NavButtons'
import { Row } from '../layout/row'
import { useContract } from 'web/hooks/use-contract-supabase'
import { Col } from '../layout/col'
import { MONTHS } from './GeneralStats'

export function MaxMinProfit(props: {
  goToPrevPage: () => void
  goToNextPage: () => void
  user: User
}) {
  const { goToPrevPage, goToNextPage, user } = props
  const [animateIn, setAnimateIn] = useState(true)
  const [animateIn2, setAnimateIn2] = useState(false)
  const [animateOut, setAnimateOut] = useState(false)

  const { maxProfit, minProfit } = useMaxAndMinProfit(user.id)
  const maxContract = useContract(maxProfit?.contractId)
  const minContract = useContract(minProfit?.contractId)

  //triggers for animation in
  useEffect(() => {
    if (!animateIn) return
    const timeout1 = setTimeout(() => {
      setAnimateIn2(true)
    }, 2000)
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

  if (maxContract == undefined || minContract == undefined) {
    return (
      <div className="mx-auto my-auto">
        <LoadingIndicator />
      </div>
    )
  }

  if (maxContract == null || minContract == null) {
    return <>An error occured</>
  }

  return (
    <>
      <div className="relative mx-auto my-auto">
        <Row
          className={clsx(
            'h-full max-w-lg',
            animateOut ? 'animate-fade-out' : ''
          )}
        >
          <div className="grow-y w-7 bg-gradient-to-b from-green-300 via-gray-300 to-red-300" />
          <Col className="grow-y justify-between">
            <div
              className={clsx(
                'px-6 text-2xl text-green-300',
                'animate-fade-in'
              )}
            >
              {formatMoney(maxProfit?.profit ?? 0)}
            </div>
            <div
              className={clsx(
                'px-6 text-2xl text-red-300',
                animateIn2 ? 'animate-fade-in' : 'invisible'
              )}
            >
              {formatMoney(minProfit?.profit ?? 0)}
            </div>
          </Col>
          <Col className="h-full justify-between gap-3">
            <div
              className={clsx(
                'line-clamp-8 px-6 text-2xl',
                animateOut ? 'animate-fade-out' : 'animate-fade-in'
              )}
            >
              You made the most betting
              <BettingDirection profit={maxProfit} /> on{' '}
              <b>{maxContract.question}</b>
            </div>
            <div
              className={clsx(
                'line-clamp-8 px-6 text-2xl',
                animateIn2
                  ? animateOut
                    ? 'animate-fade-out'
                    : 'animate-fade-in'
                  : 'invisible'
              )}
            >
              You lost the most betting
              <BettingDirection profit={minProfit} />
              on <b>{minContract.question}</b>
            </div>
          </Col>
        </Row>
      </div>
      <NavButtons goToPrevPage={goToPrevPage} goToNextPage={onGoToNext} />
    </>
  )
}

function BettingDirection(props: { profit: ProfitType | null | undefined }) {
  if (!props.profit) {
    return <> </>
  }
  const { hasYesShares, hasNoShares } = props.profit
  return (
    <>
      {hasYesShares ? (
        <span className="text-green-300"> YES </span>
      ) : hasNoShares ? (
        <span className="text-red-300"> NO </span>
      ) : (
        <> </>
      )}
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
