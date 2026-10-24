import clsx from 'clsx'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUser } from 'web/hooks/use-user'
import { usePersonalizedManaOffers } from 'web/hooks/use-personalized-mana-offers'
import { Button, SizeType } from '../buttons/button'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { AddFundsOfferBadge } from './add-funds-offer-badge'

const RAIN_COINS = 36
const RAIN_MAX_MS = 3200

type RainCoin = {
  left: number
  size: number
  delay: number
  dur: number
  drift: number
  spin: number
  tilt: number
}

const makeRain = (): RainCoin[] =>
  Array.from({ length: RAIN_COINS }, () => ({
    left: Math.random() * 100,
    size: 20 + Math.random() * 18,
    delay: Math.random() * 900,
    dur: 1300 + Math.random() * 1000,
    drift: (Math.random() - 0.5) * 80,
    spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720),
    tilt: (Math.random() - 0.5) * 40,
  }))

// Hover-capable devices only, and never when the user asked for reduced motion.
const canRain = () =>
  typeof window !== 'undefined' &&
  window.matchMedia(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)'
  ).matches

// The rain plays once per visit (browser session), not on every hover.
const RAIN_SEEN_KEY = 'mana-rain-seen'
let rainSeen = false
const hasSeenRain = () => {
  if (rainSeen) return true
  try {
    return sessionStorage.getItem(RAIN_SEEN_KEY) === '1'
  } catch {
    return false
  }
}
const markRainSeen = () => {
  rainSeen = true
  try {
    sessionStorage.setItem(RAIN_SEEN_KEY, '1')
  } catch {}
}

function useManaRain() {
  const [coins, setCoins] = useState<RainCoin[]>()
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timer.current), [])

  const start = () => {
    if (coins || hasSeenRain() || !canRain()) return
    markRainSeen()
    setCoins(makeRain())
    timer.current = setTimeout(() => setCoins(undefined), RAIN_MAX_MS)
  }
  return { coins, start }
}

function ManaRain(props: { coins: RainCoin[] }) {
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
      {props.coins.map((c, i) => (
        <img
          key={i}
          src="/mana.svg"
          alt=""
          className="mana-rain-coin"
          style={
            {
              left: `${c.left}%`,
              width: c.size,
              height: c.size,
              '--delay': `${c.delay}ms`,
              '--dur': `${c.dur}ms`,
              '--drift': `${c.drift}px`,
              '--spin': `${c.spin}deg`,
              '--tilt': `${c.tilt}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>,
    document.body
  )
}

export function AddFundsButton(props: {
  userId?: string
  className?: string
  size?: SizeType
}) {
  const { userId, className, size } = props
  const user = useUser()
  const router = useRouter()
  const { pendingCount, activeCount, nextExpiresAt } =
    usePersonalizedManaOffers()
  const rain = useManaRain()

  if (!userId || user?.id !== userId) return null

  // className is forwarded to BOTH the wrapper (so layout properties like
  // `w-full` resize the badge anchor) and the button (so it actually fills
  // the wrapper). `relative` on the wrapper is the positioning context for
  // the absolutely-positioned badge.
  return (
    <span
      className={clsx('relative inline-block', className)}
      onMouseEnter={rain.start}
    >
      <Button
        onClick={() =>
          router.asPath.includes('/checkout')
            ? router.reload()
            : router.push('/checkout')
        }
        size={size ?? 'md'}
        color="gradient-pink"
        className={className}
      >
        Get mana <ManaCoin className="ml-1" />
      </Button>
      {rain.coins && <ManaRain coins={rain.coins} />}
      <AddFundsOfferBadge
        pendingCount={pendingCount}
        activeCount={activeCount}
        nextExpiresAt={nextExpiresAt}
      />
    </span>
  )
}
