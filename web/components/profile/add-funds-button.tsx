import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { AddFundsModal } from '../add-funds-modal'
import { Button, SizeType } from '../buttons/button'
import { TWOMBA_ENABLED } from 'common/envs/constants'
import { useRouter } from 'next/router'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'

export function AddFundsButton(props: {
  userId?: string
  className?: string
  size?: SizeType
}) {
  const { userId, className, size } = props
  const [open, setOpen] = useState(false)
  const user = useUser()
  const router = useRouter()
  if (!userId || user?.id !== userId) return null
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
      <AddFundsModal open={open} setOpen={setOpen} />
    </>
  )
}
