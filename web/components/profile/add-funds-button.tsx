import { AddFundsModal } from '../add-funds-modal'
import { useUser } from 'web/hooks/use-user'
import { useState } from 'react'
import { PlusIcon } from '@heroicons/react/solid'
import { Button } from '../buttons/button'
import { useIsMobile } from 'web/hooks/use-is-mobile'

export function AddFundsButton(props: { userId?: string; className?: string }) {
  const { userId, className } = props
  const [open, setOpen] = useState(false)
  const user = useUser()
  const isMobile = useIsMobile()
  if (!userId || user?.id !== userId) return null
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size={isMobile ? '2xs' : 'xs'}
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
