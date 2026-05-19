import clsx from 'clsx'
import { useRouter } from 'next/router'
import { useUser } from 'web/hooks/use-user'
import { usePersonalizedManaOffers } from 'web/hooks/use-personalized-mana-offers'
import { Button, SizeType } from '../buttons/button'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { AddFundsOfferBadge } from './add-funds-offer-badge'

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
    <span className={clsx('relative inline-block', className)}>
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
      <AddFundsOfferBadge
        pendingCount={pendingCount}
        activeCount={activeCount}
        nextExpiresAt={nextExpiresAt}
      />
    </span>
  )
}
