import clsx from 'clsx'
import { useRouter } from 'next/router'
import { useUser } from 'web/hooks/use-user'
import { usePersonalizedManaOffers } from 'web/hooks/use-personalized-mana-offers'
import { Button, SizeType } from '../buttons/button'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { AddFundsOfferBadge } from './add-funds-offer-badge'

// Direction (px), rotation (deg) and delay (ms) for each coin in the hover burst.
const BURST_COINS = [
  { dx: -34, dy: -38, rot: -200, delay: 0 },
  { dx: -12, dy: -48, rot: 160, delay: 60 },
  { dx: 14, dy: -46, rot: -140, delay: 20 },
  { dx: 36, dy: -34, rot: 220, delay: 90 },
  { dx: -44, dy: -12, rot: 120, delay: 120 },
  { dx: 46, dy: -10, rot: -180, delay: 40 },
]

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

  if (!userId || user?.id !== userId) return null

  // className is forwarded to BOTH the wrapper (so layout properties like
  // `w-full` resize the badge anchor) and the button (so it actually fills
  // the wrapper). `relative` on the wrapper is the positioning context for
  // the absolutely-positioned badge.
  return (
    <span className={clsx('mana-burst relative inline-block', className)}>
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
        Get mana <ManaCoin className="mana-burst-icon ml-1" />
      </Button>
      {BURST_COINS.map((c, i) => (
        <img
          key={i}
          src="/mana.svg"
          alt=""
          aria-hidden
          className="mana-burst-coin"
          style={
            {
              '--dx': `${c.dx}px`,
              '--dy': `${c.dy}px`,
              '--rot': `${c.rot}deg`,
              '--delay': `${c.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
      <AddFundsOfferBadge
        pendingCount={pendingCount}
        activeCount={activeCount}
        nextExpiresAt={nextExpiresAt}
      />
    </span>
  )
}
