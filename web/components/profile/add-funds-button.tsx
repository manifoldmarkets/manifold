import { AddFundsModal } from '../add-funds-modal'
import { Button } from '../buttons/button'
import { useUser } from 'web/hooks/use-user'
import { useState } from 'react'

export function AddFundsButton(props: { userId?: string; className?: string }) {
  const { userId, className } = props
  const [open, setOpen] = useState(false)
  const user = useUser()
  if (!userId || user?.id !== userId) return null

  return (
    <>
      <Button
        className={className}
        color="indigo"
        onClick={() => setOpen(true)}
        size="xs"
      >
        Get Ṁ
      </Button>
      <AddFundsModal open={open} setOpen={setOpen} />
    </>
  )
}
