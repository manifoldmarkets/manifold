import { AddFundsModal } from '../add-funds-modal'
import { Button } from '../buttons/button'
import { ENV_CONFIG } from 'common/envs/constants'
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
        size="2xs"
      >
        Get {ENV_CONFIG.moneyMoniker}
      </Button>
      <AddFundsModal open={open} setOpen={setOpen} />
    </>
  )
}
