import clsx from 'clsx'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import { ProfitType, useMaxAndMinProfit } from 'web/hooks/use-wrapped-2024'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { NavButtons } from './NavButtons'
import { LoadingIndicator } from '../widgets/loading-indicator'

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

  if (maxProfit === undefined || minProfit === undefined) {
    return (
      <div className="mx-auto my-auto">
        <LoadingIndicator />
      </div>
    )
  }

  if (maxProfit === null || minProfit === null) {
    return (
      <>
        <div className="mx-auto my-auto">
          You don't have any resolved bets this year!
        </div>
        <NavButtons goToPrevPage={goToPrevPage} goToNextPage={onGoToNext} />
      </>
    )
  }

  function getBetOnThing(profit: ProfitType) {
    const contract = profit.contract
    const betOnAnswer =
      profit.answerId && 'answers' in contract
        ? contract.answers.find((a) => a.id === profit.answerId)
        : undefined
    return [contract, betOnAnswer]
  }

  const [maxContract, maxBetOnAnswer] = getBetOnThing(maxProfit)
  const [minContract, minBetOnAnswer] = getBetOnThing(minProfit)

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
              You made the most trading
              <BettingDirection profit={maxProfit} /> on{' '}
              <b>
                {maxBetOnAnswer ? maxBetOnAnswer.text : maxContract.question}
              </b>{' '}
              {maxBetOnAnswer && <>on {maxContract.question}</>}
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
              You lost the most trading
              <BettingDirection profit={minProfit} />
              on{' '}
              <b>
                {minBetOnAnswer ? minBetOnAnswer.text : minContract.question}
              </b>{' '}
              {minBetOnAnswer && <>on {minContract.question}</>}
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
