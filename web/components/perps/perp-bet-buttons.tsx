import clsx from 'clsx'
import dynamic from 'next/dynamic'
import { MouseEvent, useState } from 'react'

import { PerpContract, tradingAllowed } from 'common/contract'
import { Button, SizeType } from 'web/components/buttons/button'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'

const PerpBetModal = dynamic(
  () => import('./perp-bet-modal').then((module) => module.PerpBetModal),
  { ssr: false }
)

// A lightweight entry point for cards and tables. Position and quote polling
// only mount when the dialog opens, even on a feed with many perp cards.
export function PerpBetButtons(props: {
  contract: PerpContract
  variant?: 'directions' | 'bet'
  labels?: { long: string; short: string }
  size?: SizeType
  className?: string
  buttonClassName?: string
  location?: string
  feedReason?: string
  onTrade?: () => void
}) {
  const {
    contract,
    variant = 'directions',
    labels = { long: 'Long', short: 'Short' },
    size = 'xs',
    className,
    buttonClassName,
    location = 'feed card',
    feedReason,
    onTrade,
  } = props
  const user = useUser()
  const [open, setOpen] = useState(false)
  const [initialDirection, setInitialDirection] = useState<'long' | 'short'>()

  if (!tradingAllowed(contract) && !open) return null

  const openBet = (
    event: MouseEvent<HTMLButtonElement>,
    direction?: 'long' | 'short'
  ) => {
    event.preventDefault()
    event.stopPropagation()
    if (!user) {
      firebaseLogin()
      return
    }
    track('bet intent', {
      location,
      contractId: contract.id,
      direction,
      token: contract.token,
      outcomeType: contract.outcomeType,
      feedReason,
    })
    setInitialDirection(direction)
    setOpen(true)
  }

  return (
    <div
      className={clsx('stop-prop flex shrink-0 items-center gap-2', className)}
    >
      {variant === 'bet' ? (
        <Button
          color="indigo-outline"
          size={size}
          className={buttonClassName}
          aria-label={`Bet on ${contract.question}`}
          aria-haspopup="dialog"
          onClick={(event) => openBet(event)}
        >
          Bet
        </Button>
      ) : (
        <>
          <Button
            color="green-outline"
            size={size}
            className={buttonClassName}
            aria-label={`${labels.long} on ${contract.question}`}
            aria-haspopup="dialog"
            onClick={(event) => openBet(event, 'long')}
          >
            {labels.long}
          </Button>
          <Button
            color="red-outline"
            size={size}
            className={buttonClassName}
            aria-label={`${labels.short} on ${contract.question}`}
            aria-haspopup="dialog"
            onClick={(event) => openBet(event, 'short')}
          >
            {labels.short}
          </Button>
        </>
      )}
      {open && (
        <PerpBetModal
          key={contract.id}
          contract={contract}
          open={open}
          setOpen={setOpen}
          initialDirection={initialDirection}
          onTrade={onTrade}
        />
      )}
    </div>
  )
}
