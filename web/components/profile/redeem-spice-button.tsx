import { AddFundsModal } from '../add-funds-modal'
import { useUser } from 'web/hooks/use-user'
import { useState } from 'react'
import { PlusIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Button } from '../buttons/button'
import { RedeemSpiceModal } from '../redeem-spice-modal'

export function RedeemSpiceButton(props: {
  userId?: string
  className?: string
}) {
  const { userId, className } = props
  const [open, setOpen] = useState(false)
  const user = useUser()
  if (!userId || user?.id !== userId) return null
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="2xs"
        color="sky-outline"
        className="h-min sm:inline-flex"
      >
        Redeem
      </Button>
      <RedeemSpiceModal open={open} setOpen={setOpen} user={user} />
    </>
  )
}
