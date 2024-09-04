import { PlusIcon } from '@heroicons/react/solid'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { Button, SizeType } from '../buttons/button'
import { AddFundsModal } from '../add-funds/add-funds-modal'

export function AddFundsButton(props: {
  userId?: string
  className?: string
  size?: SizeType
}) {
  const { userId, className, size } = props
  const [open, setOpen] = useState(false)
  const user = useUser()

  if (!userId || user?.id !== userId) return null
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size={size ?? 'md'}
        color="gradient-pink"
        className={className}
      >
        <PlusIcon className="mr-1 h-3 w-3" />
        Get mana
      </Button>
      <AddFundsModal open={open} setOpen={setOpen} />
    </>
  )
}
