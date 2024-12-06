import clsx from 'clsx'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import { ProfitType, useMaxAndMinProfit } from 'web/hooks/use-wrapped-2024'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { NavButtons } from './NavButtons'

export function MaxMinProfit(props: {
  goToPrevPage: () => void
  goToNextPage: () => void
  user: User
}) {
  const { goToPrevPage, goToNextPage, user } = props
  const animateIn = true
  const [animateIn2, setAnimateIn2] = useState(false)
  const [animateOut, setAnimateOut] = useState(false)

  const { maxProfit, minProfit } = useMaxAndMinProfit(user.id)
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

  console.log('MAX PROFIT', maxProfit, 'MIN PROFIT', minProfit)
  if (!maxProfit || !minProfit) {
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
              <b>{maxProfit.contract.question}</b>
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
              on <b>{minProfit.contract.question}</b>
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
