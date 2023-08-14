import clsx from 'clsx'
import { CPMMBinaryContract } from 'common/contract'
import { useState } from 'react'
import { User, firebaseLogin } from 'web/lib/firebase/users'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { BuyPanel, binaryOutcomes } from './bet-panel'

export function BetButton(props: {
  contract: CPMMBinaryContract
  user: User | null | undefined
  className?: string
}) {
  const { contract, user, className } = props
  const { closeTime } = contract
  const isClosed = closeTime && closeTime < Date.now()
  const [dialogueThatIsOpen, setDialogueThatIsOpen] =
    useState<binaryOutcomes>(undefined)
  if (isClosed) return null

  return (
    <div className={className}>
      <FeedBetButton
        dialogueThatIsOpen={dialogueThatIsOpen}
        setDialogueThatIsOpen={setDialogueThatIsOpen}
        contract={contract}
        outcome="YES"
        user={user}
      />
    </div>
  )
}

function FeedBetButton(props: {
  dialogueThatIsOpen: binaryOutcomes
  setDialogueThatIsOpen: (outcome: binaryOutcomes) => void
  contract: CPMMBinaryContract
  outcome: 'YES' | 'NO'
  user?: User | null | undefined
}) {
  const { dialogueThatIsOpen, setDialogueThatIsOpen, contract, outcome, user } =
    props
  return (
    <>
      <Button
        color="indigo-outline"
        size="2xs"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!user) {
            firebaseLogin()
            return
          }
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
          <div className="mt-0 mb-4 text-xl">{contract.question}</div>
          <BuyPanel
            contract={contract}
            user={user}
            initialOutcome={outcome}
            onBuySuccess={() =>
              setTimeout(() => setDialogueThatIsOpen(undefined), 500)
            }
            location={'feed card'}
          />
        </Col>
      </Modal>
    </>
  )
}
