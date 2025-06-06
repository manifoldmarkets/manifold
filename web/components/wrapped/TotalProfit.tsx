import clsx from 'clsx'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import { useTotalProfit } from 'web/hooks/use-wrapped-2024'
import { Spacer } from '../layout/spacer'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { NavButtons } from './NavButtons'

export function TotalProfit(props: {
  goToPrevPage: () => void
  goToNextPage: () => void
  user: User
}) {
  const { goToPrevPage, goToNextPage, user } = props
  const animateIn = true
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
    }, 4000)
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
    return (
      <div className="mx-auto my-auto">
        <LoadingIndicator />
      </div>
    )
  }

  if (totalProfit == null) {
    return <>An error occured</>
  }

  const positiveProfit = totalProfit >= 0
  return (
    <>
      <div className="relative mx-auto my-auto">
        <div
          className={clsx(
            'px-6 text-2xl',
            animateOut ? 'animate-fade-out' : 'animate-fade-in'
          )}
        >
          On those trades, you{positiveProfit ? ' made' : ' lost'}{' '}
          <span
            className={clsx(
              'font-bold ',
              positiveProfit ? 'text-green-300' : 'text-red-300'
            )}
          >
            {formatMoney(Math.abs(totalProfit))}
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
