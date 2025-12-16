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

export function IntroSlide(props: {
  goToNextPage: () => void
  user: User
}) {
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
      <div className="absolute -top-20 left-10 text-6xl opacity-20 animate-bounce" style={{ animationDuration: '3s' }}>🎄</div>
      <div className="absolute -top-16 right-10 text-5xl opacity-20 animate-bounce" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }}>⭐</div>
      
      <div
        className={clsx(
          'transition-all duration-1000',
          animateTitle ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        )}
      >
        <h1 className="font-christmas text-6xl sm:text-7xl font-bold bg-gradient-to-r from-red-400 via-green-300 to-red-400 bg-clip-text text-transparent drop-shadow-lg">
          Manifold
        </h1>
        <h1 className="font-christmas text-7xl sm:text-8xl font-bold bg-gradient-to-r from-green-300 via-red-400 to-green-300 bg-clip-text text-transparent drop-shadow-lg mt-2">
          Wrapped
        </h1>
        <div className="text-4xl sm:text-5xl font-bold text-white/90 mt-4 flex items-center justify-center gap-3">
          <span className="text-red-400">🎁</span>
          2025
          <span className="text-green-400">🎄</span>
        </div>
      </div>

      <div
        className={clsx(
          'transition-all duration-1000 delay-300',
          animateSubtitle ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        )}
      >
        <p className="text-2xl text-white/80">
          Welcome back, <span className="font-semibold text-green-300">{user.name}</span>!
        </p>
        <p className="text-lg text-white/60 mt-2">
          Let's unwrap your prediction journey this year 🎅
        </p>
      </div>

      <button
        onClick={goToNextPage}
        className={clsx(
          'mt-8 px-8 py-4 rounded-full text-xl font-bold transition-all duration-500',
          'bg-gradient-to-r from-red-500 to-green-500 hover:from-red-400 hover:to-green-400',
          'text-white shadow-lg hover:shadow-xl hover:scale-105',
          'border-2 border-white/20',
          animateButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
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
    : "Coal in your stocking this year..."

  return (
    <>
      <Col
        className={clsx(
          'relative mx-auto my-auto items-center justify-center gap-6 px-6 text-center transition-all duration-700',
          animateOut ? 'opacity-0 scale-95' : animateIn ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        )}
      >
        <div className="text-6xl mb-4">{emoji}</div>
        <p className="text-xl text-white/70">Your total profit in 2025</p>
        <div
          className={clsx(
            'text-6xl sm:text-7xl font-bold',
            isProfit ? 'text-green-400' : 'text-red-400'
          )}
        >
          {formatMoney(totalProfit ?? 0)}
        </div>
        <p className="text-2xl text-white/80 mt-4">{message}</p>
        
        {/* Decorative elements */}
        <div className="flex gap-4 mt-6 text-4xl">
          {isProfit ? (
            <>🎄✨🎅✨🎄</>
          ) : (
            <>❄️💨🥶💨❄️</>
          )}
        </div>
      </Col>
      <NavButtons goToPrevPage={goToPrevPage} goToNextPage={onGoToNext} />
    </>
  )
}

export function OutroSlide(props: {
  goToPrevPage: () => void
  user: User
}) {
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
          animateIn ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        )}
      >
        <div className="text-8xl mb-4">🎄</div>
        <h2 className="text-4xl sm:text-5xl font-bold text-white">
          Happy Holidays,
        </h2>
        <h2 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-red-400 to-green-400 bg-clip-text text-transparent">
          {user.name}!
        </h2>
        <p className="text-xl text-white/70 mt-4 max-w-md">
          Thanks for predicting with us in 2025. Here's to another year of
          forecasting, trading, and being right (sometimes)!
        </p>
        
        <div className="flex gap-3 mt-8 text-5xl">
          🎁🎅❄️⭐🦌
        </div>

        <a
          href="/home"
          className={clsx(
            'mt-8 px-8 py-4 rounded-full text-xl font-bold transition-all',
            'bg-gradient-to-r from-green-500 to-red-500 hover:from-green-400 hover:to-red-400',
            'text-white shadow-lg hover:shadow-xl hover:scale-105'
          )}
        >
          🏠 Back to Manifold
        </a>
      </Col>
      <NavButtons goToPrevPage={goToPrevPage} goToNextPage={() => {}} hideNext />
    </>
  )
}
