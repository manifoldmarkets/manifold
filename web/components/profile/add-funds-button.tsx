import { introductoryTimeWindow } from 'common/user'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { AddFundsModal } from '../add-funds-modal'
import { Button, SizeType } from '../buttons/button'
import { RelativeTimestamp } from '../relative-timestamp'
import { useIsNativeIOS } from '../native-message-provider'

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
  const isNativeIOS = useIsNativeIOS()

  if (!userId || user?.id !== userId) return null

  const expirationStart = user
    ? new Date(introductoryTimeWindow(user))
    : new Date()

  const eligibleForNewUserOffer =
    user &&
    Date.now() < expirationStart.valueOf() &&
    !user.purchasedSweepcash &&
    !isNativeIOS

  return (
    <>
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
