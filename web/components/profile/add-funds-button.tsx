import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { AddFundsModal } from '../add-funds-modal'
import { Button, SizeType } from '../buttons/button'
import { TWOMBA_ENABLED } from 'common/envs/constants'
import { useRouter } from 'next/router'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { introductoryTimeWindow } from 'common/user'
import { RelativeTimestamp } from '../relative-timestamp'
import Link from 'next/link'

export function AddFundsButton(props: {
  userId?: string
  className?: string
  size?: SizeType
  hideDiscount?: boolean
}) {
  const { userId, className, size, hideDiscount } = props
  const [open, setOpen] = useState(false)
  const user = useUser()
  const router = useRouter()
  if (!userId || user?.id !== userId) return null
  const expirationStart = user
    ? new Date(introductoryTimeWindow(user))
    : new Date()
  const eligibleForNewUserOffer =
    user && Date.now() < expirationStart.valueOf() && !user.purchasedSweepcash
  return (
    <>
      <Button
        onClick={() =>
          TWOMBA_ENABLED
            ? router.asPath.includes('/checkout')
              ? router.reload()
              : router.push('/checkout')
            : setOpen(true)
        }
        size={size ?? 'md'}
        color="gradient-pink"
        className={className}
      >
        Get <ManaCoin className="ml-1" /> and <SweepiesCoin className="ml-1" />
      </Button>
      {eligibleForNewUserOffer && !hideDiscount && (
        <Link href="/checkout" className="text-center text-sm text-amber-500">
          ✨ 64% discount expires in
          <RelativeTimestamp
            className="text-amber-500 "
            time={expirationStart.valueOf()}
            shortened
          />{' '}
          ✨
        </Link>
      )}
      <AddFundsModal open={open} setOpen={setOpen} />
    </>
  )
}
