import clsx from 'clsx'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import { MonthlyBetsType, useTotalProfit } from 'web/hooks/use-wrapped-2023'
import { Spacer } from '../layout/spacer'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { NavButtons } from './NavButtons'
import { MONTHS } from './GeneralStats'

export function TotalProfit(props: {
  goToPrevPage: () => void
  goToNextPage: () => void
  user: User
}) {
  const { goToPrevPage, goToNextPage, user } = props
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
