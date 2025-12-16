import clsx from 'clsx'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import { useTotalProfit } from 'web/hooks/use-wrapped-2025'
import { Col } from '../layout/col'
import { NavButtons } from './NavButtons'
import { LoadingIndicator } from '../widgets/loading-indicator'

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export function IntroSlide(props: { goToNextPage: () => void; user: User }) {
  const { goToNextPage, user } = props
  const [animateTitle, setAnimateTitle] = useState(false)
  const [animateSubtitle, setAnimateSubtitle] = useState(false)
  const [animateButton, setAnimateButton] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setAnimateTitle(true), 300)
    const t2 = setTimeout(() => setAnimateSubtitle(true), 1000)
    const t3 = setTimeout(() => setAnimateButton(true), 1800)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [])

  return (
    <Col className="relative mx-auto my-auto items-center justify-center gap-8 px-6 text-center">
      {/* Decorative ornaments */}
      <div
        className="absolute -top-20 left-10 animate-bounce text-6xl opacity-20"
        style={{ animationDuration: '3s' }}
      >
        🎄
      </div>
      <div
        className="absolute -top-16 right-10 animate-bounce text-5xl opacity-20"
        style={{ animationDuration: '2.5s', animationDelay: '0.5s' }}
      >
        ⭐
      </div>

      <div
        className={clsx(
          'transition-all duration-1000',
          animateTitle ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
        )}
      >
        <h1 className="font-christmas bg-gradient-to-r from-red-400 via-green-300 to-red-400 bg-clip-text text-6xl font-bold text-transparent drop-shadow-lg sm:text-7xl">
          Manifold
        </h1>
        <h1 className="font-christmas mt-2 bg-gradient-to-r from-green-300 via-red-400 to-green-300 bg-clip-text text-7xl font-bold text-transparent drop-shadow-lg sm:text-8xl">
          Wrapped
        </h1>
        <div className="mt-4 flex items-center justify-center gap-3 text-4xl font-bold text-white/90 sm:text-5xl">
          <span className="text-red-400">🎁</span>
          2025
          <span className="text-green-400">🎄</span>
        </div>
      </div>

      <div
        className={clsx(
          'transition-all delay-300 duration-1000',
          animateSubtitle
            ? 'translate-y-0 opacity-100'
            : 'translate-y-8 opacity-0'
        )}
      >
        <p className="text-2xl text-white/80">
          Welcome back,{' '}
          <span className="font-semibold text-green-300">{user.name}</span>!
        </p>
        <p className="mt-2 text-lg text-white/60">
          Let's unwrap your prediction journey this year 🎅
        </p>
      </div>

      <button
        onClick={goToNextPage}
        className={clsx(
          'mt-8 rounded-full px-8 py-4 text-xl font-bold transition-all duration-500',
          'bg-gradient-to-r from-red-500 to-green-500 hover:from-red-400 hover:to-green-400',
          'text-white shadow-lg hover:scale-105 hover:shadow-xl',
          'border-2 border-white/20',
          animateButton
            ? 'translate-y-0 opacity-100'
            : 'translate-y-8 opacity-0'
        )}
      >
        ✨ Unwrap My Year ✨
      </button>
    </Col>
  )
}

export function TotalProfitSlide(props: {
  goToPrevPage: () => void
  goToNextPage: () => void
  user: User
}) {
  const { goToPrevPage, goToNextPage, user } = props
  const totalProfit = useTotalProfit(user.id)
  const [animateIn, setAnimateIn] = useState(false)
  const [animateOut, setAnimateOut] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setAnimateIn(true), 300)
    const t2 = setTimeout(() => onGoToNext(), 5000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  const onGoToNext = () => {
    setAnimateOut(true)
    setTimeout(goToNextPage, 800)
  }

  if (totalProfit === undefined) {
    return (
      <div className="mx-auto my-auto">
        <LoadingIndicator />
      </div>
    )
  }

  const isProfit = (totalProfit ?? 0) >= 0
  const emoji = isProfit ? '🎁' : '🪨'
  const message = isProfit
    ? "Santa's been good to you!"
    : 'Coal in your stocking this year...'

  return (
    <>
      <Col
        className={clsx(
          'relative mx-auto my-auto items-center justify-center gap-6 px-6 text-center transition-all duration-700',
          animateOut
            ? 'scale-95 opacity-0'
            : animateIn
            ? 'scale-100 opacity-100'
            : 'scale-95 opacity-0'
        )}
      >
        <div className="mb-4 text-6xl">{emoji}</div>
        <p className="text-xl text-white/70">Your total profit in 2025</p>
        <div
          className={clsx(
            'text-6xl font-bold sm:text-7xl',
            isProfit ? 'text-green-400' : 'text-red-400'
          )}
        >
          {formatMoney(totalProfit ?? 0)}
        </div>
        <p className="mt-4 text-2xl text-white/80">{message}</p>

        {/* Decorative elements */}
        <div className="mt-6 flex gap-4 text-4xl">
          {isProfit ? <>🎄✨🎅✨🎄</> : <>❄️💨🥶💨❄️</>}
        </div>
      </Col>
      <NavButtons goToPrevPage={goToPrevPage} goToNextPage={onGoToNext} />
    </>
  )
}

export function OutroSlide(props: { goToPrevPage: () => void; user: User }) {
  const { goToPrevPage, user } = props
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setAnimateIn(true), 300)
    return () => clearTimeout(t1)
  }, [])

  return (
    <>
      <Col
        className={clsx(
          'relative mx-auto my-auto items-center justify-center gap-6 px-6 text-center transition-all duration-700',
          animateIn ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        )}
      >
        <div className="mb-4 text-8xl">🎄</div>
        <h2 className="text-4xl font-bold text-white sm:text-5xl">
          Happy Holidays,
        </h2>
        <h2 className="bg-gradient-to-r from-red-400 to-green-400 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl">
          {user.name}!
        </h2>
        <p className="mt-4 max-w-md text-xl text-white/70">
          Thanks for predicting with us in 2025. Here's to another year of
          forecasting, trading, and being right (sometimes)!
        </p>

        <div className="mt-8 flex gap-3 text-5xl">🎁🎅❄️⭐🦌</div>

        <a
          href="/home"
          className={clsx(
            'mt-8 rounded-full px-8 py-4 text-xl font-bold transition-all',
            'bg-gradient-to-r from-green-500 to-red-500 hover:from-green-400 hover:to-red-400',
            'text-white shadow-lg hover:scale-105 hover:shadow-xl'
          )}
        >
          🏠 Back to Manifold
        </a>
      </Col>
      <NavButtons
        goToPrevPage={goToPrevPage}
        goToNextPage={() => {}}
        hideNext
      />
    </>
  )
}
