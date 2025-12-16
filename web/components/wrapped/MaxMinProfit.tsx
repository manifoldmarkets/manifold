import clsx from 'clsx'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import { ProfitType, useMaxAndMinProfit } from 'web/hooks/use-wrapped-2025'
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
        <Col className="mx-auto my-auto items-center gap-4 text-center">
          <div className="text-6xl">🎅</div>
          <div className="text-2xl text-white">
            You don't have any resolved bets this year!
          </div>
          <div className="text-lg text-white/60">
            Santa's checking his list twice...
          </div>
        </Col>
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
      <div className="relative mx-auto my-auto px-4">
        <Row
          className={clsx(
            'h-full max-w-lg gap-4',
            animateOut ? 'animate-fade-out' : ''
          )}
        >
          {/* Christmas gradient bar */}
          <div className="w-3 shrink-0 rounded-full bg-gradient-to-b from-green-400 via-white/50 to-red-400 shadow-lg" />

          <Col className="justify-between gap-8">
            {/* Best trade - Gift */}
            <div
              className={clsx('transition-all duration-700', 'animate-fade-in')}
            >
              <Row className="mb-2 items-center gap-3">
                <span className="text-4xl">🎁</span>
                <span className="text-3xl font-bold text-green-400">
                  {formatMoney(maxProfit?.profit ?? 0)}
                </span>
              </Row>
              <div className="text-xl text-white">
                Your best gift was trading
                <BettingDirection profit={maxProfit} /> on{' '}
                <span className="font-semibold text-green-300">
                  {maxBetOnAnswer ? maxBetOnAnswer.text : maxContract.question}
                </span>
                {maxBetOnAnswer && (
                  <span className="text-white/70">
                    {' '}
                    on {maxContract.question}
                  </span>
                )}
              </div>
            </div>

            {/* Worst trade - Coal */}
            <div
              className={clsx(
                'transition-all duration-700',
                animateIn2
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-4 opacity-0'
              )}
            >
              <Row className="mb-2 items-center gap-3">
                <span className="text-4xl">🪨</span>
                <span className="text-3xl font-bold text-red-400">
                  {formatMoney(minProfit?.profit ?? 0)}
                </span>
              </Row>
              <div className="text-xl text-white">
                Your lump of coal was trading
                <BettingDirection profit={minProfit} /> on{' '}
                <span className="font-semibold text-red-300">
                  {minBetOnAnswer ? minBetOnAnswer.text : minContract.question}
                </span>
                {minBetOnAnswer && (
                  <span className="text-white/70">
                    {' '}
                    on {minContract.question}
                  </span>
                )}
              </div>
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
        <span className="font-bold text-green-300"> YES </span>
      ) : hasNoShares ? (
        <span className="font-bold text-red-300"> NO </span>
      ) : (
        <> </>
      )}
    </>
  )
}
