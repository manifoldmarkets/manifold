import clsx from 'clsx'
import { CPMMBinaryContract } from 'common/contract'
import { useState } from 'react'
import { User, firebaseLogin } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { BuyPanel, binaryOutcomes } from './bet-panel'

export function BetRow(props: {
  contract: CPMMBinaryContract
  user: User | null | undefined
}) {
  const { contract, user } = props
  const { closeTime } = contract
  const isClosed = closeTime && closeTime < Date.now()
  const [dialogueThatIsOpen, setDialogueThatIsOpen] =
    useState<binaryOutcomes>(undefined)
  if (isClosed) return null

  return (
    <Row>
      <FeedBetButton
        dialogueThatIsOpen={dialogueThatIsOpen}
        setDialogueThatIsOpen={setDialogueThatIsOpen}
        contract={contract}
        outcome="YES"
        user={user}
      />
      <FeedBetButton
        dialogueThatIsOpen={dialogueThatIsOpen}
        setDialogueThatIsOpen={setDialogueThatIsOpen}
        contract={contract}
        outcome="NO"
        user={user}
      />
    </Row>
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
      <button
        className={clsx(
          'border-ink-300 hover:text-canvas-0 whitespace-nowrap border px-2 py-1 transition-colors',
          outcome == 'YES'
            ? 'rounded-l border-r-0 text-teal-500 hover:bg-teal-500'
            : 'text-scarlet-500 hover:bg-scarlet-500 rounded-r'
        )}
        onClick={(e) => {
          e.stopPropagation()
          if (!user) {
            firebaseLogin()
            return
          }
          setDialogueThatIsOpen(outcome)
        }}
      >
        Bet <span>{outcome}</span>
      </button>

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
          <div className="!mt-0 !mb-4 !text-xl">{contract.question}</div>
          <BuyPanel
            contract={contract}
            user={user}
            mobileView={true}
            hidden={false}
            initialOutcome={outcome}
            onBuySuccess={() =>
              setTimeout(() => setDialogueThatIsOpen(undefined), 500)
            }
            location={'feed card'}
            singularView={outcome}
          />
        </Col>
      </Modal>
    </>
  )
}
