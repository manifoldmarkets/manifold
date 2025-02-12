import { useRouter } from 'next/router'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { AddFundsModal } from '../add-funds-modal'
import { Button, SizeType } from '../buttons/button'

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
          router.asPath.includes('/checkout')
            ? router.reload()
            : router.push('/checkout')
        }
        size={size ?? 'md'}
        color="gradient-pink"
        className={className}
      >
        Get <ManaCoin className="ml-1" />
      </Button>

      <AddFundsModal open={open} setOpen={setOpen} />
    </>
  )
}
