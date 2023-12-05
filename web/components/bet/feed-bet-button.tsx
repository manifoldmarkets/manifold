import clsx from 'clsx'
import { CPMMBinaryContract } from 'common/contract'
import { useState } from 'react'
import { User, firebaseLogin } from 'web/lib/firebase/users'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { BuyPanel, BinaryOutcomes } from './bet-panel'
import { track } from 'web/lib/service/analytics'

export function BetButton(props: {
  contract: CPMMBinaryContract
  user: User | null | undefined
  feedId?: number
  className?: string
}) {
  const { contract, user, feedId, className } = props
  const { closeTime } = contract
  const isClosed = closeTime && closeTime < Date.now()
  const [dialogueThatIsOpen, setDialogueThatIsOpen] =
    useState<BinaryOutcomes>(undefined)
  if (isClosed) return null

  return (
    <div className={className}>
      <FeedBetButton
        dialogueThatIsOpen={dialogueThatIsOpen}
        setDialogueThatIsOpen={setDialogueThatIsOpen}
        contract={contract}
        outcome="YES"
        user={user}
        feedId={feedId}
      />
    </div>
  )
}

function FeedBetButton(props: {
  dialogueThatIsOpen: BinaryOutcomes
  setDialogueThatIsOpen: (outcome: BinaryOutcomes) => void
  contract: CPMMBinaryContract
  outcome: 'YES' | 'NO'
  user?: User | null | undefined
  feedId?: number
}) {
  const {
    dialogueThatIsOpen,
    feedId,
    setDialogueThatIsOpen,
    contract,
    outcome,
    user,
  } = props
  return (
    <>
      <Button
        color="indigo-outline"
        size="2xs"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          track('bet intent', { location: 'feed card' })
          if (!user) {
            firebaseLogin()
            return
          }
          track('feed bet button clicked', {
            feedId: feedId,
            contractId: contract.id,
          })
          setDialogueThatIsOpen(outcome)
        }}
      >
        Bet
      </Button>

      <Modal
        open={dialogueThatIsOpen == outcome}
        setOpen={(open) => {
          setDialogueThatIsOpen(open ? outcome : undefined)
        }}
        className={clsx(
          MODAL_CLASS,
          'pointer-events-auto max-h-[32rem] overflow-auto'
        )}
      >
        <Col>
          <div className="mb-4 mt-0 text-xl">{contract.question}</div>
          <BuyPanel
            contract={contract}
            user={user}
            initialOutcome={outcome}
            onBuySuccess={() =>
              setTimeout(() => setDialogueThatIsOpen(undefined), 500)
            }
            location={'feed card'}
            inModal={true}
          />
        </Col>
      </Modal>
    </>
  )
}
