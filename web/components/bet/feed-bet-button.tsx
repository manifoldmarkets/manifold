import clsx from 'clsx'
import { useState } from 'react'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { BuyPanel } from './bet-panel'
import { track } from 'web/lib/service/analytics'
import { BinaryContract, StonkContract } from 'common/contract'
import { User, firebaseLogin } from 'web/lib/firebase/users'
import { TRADE_TERM } from 'common/envs/constants'
import { capitalize } from 'lodash'
import {
  getCustomYesButtonText,
  getCustomNoButtonText,
} from 'common/shop/items'

export function BetButton(props: {
  contract: BinaryContract | StonkContract
  user: User | null | undefined
  feedReason?: string
  className?: string
  labels?: { yes: string; no: string }
  questionTitle?: string
}) {
  const { contract, labels, user, className, feedReason, questionTitle } = props
  const { closeTime } = contract
  const isClosed = closeTime && closeTime < Date.now()
  const customYesText = getCustomYesButtonText(user?.entitlements)
  const customNoText = getCustomNoButtonText(user?.entitlements)
  const [dialogueThatIsOpen, setDialogueThatIsOpen] = useState<
    string | undefined
  >(undefined)
  if (isClosed) return null
  const open = dialogueThatIsOpen === 'YES' || dialogueThatIsOpen === 'NO'

  const handleBetButtonClick = (outcome: 'YES' | 'NO') => {
    if (!user) {
      firebaseLogin()
      return
    }
    track('bet intent', {
      location: 'feed card',
      outcome,
      token: contract.token,
    })
    setDialogueThatIsOpen(outcome)
  }

  return (
    <div className={className}>
      <Button
        color="green-outline"
        size="xs"
        aria-label={`${
          labels?.yes ?? customYesText ?? `${capitalize(TRADE_TERM)} Yes`
        } on ${questionTitle ?? contract.question}`}
        aria-haspopup="dialog"
        onClick={() => handleBetButtonClick('YES')}
        className="mr-2"
      >
        {labels?.yes ?? customYesText ?? `${capitalize(TRADE_TERM)} Yes`}
      </Button>

      <Button
        color="red-outline"
        size="xs"
        aria-label={`${
          labels?.no ?? customNoText ?? `${capitalize(TRADE_TERM)} No`
        } on ${questionTitle ?? contract.question}`}
        aria-haspopup="dialog"
        onClick={() => handleBetButtonClick('NO')}
      >
        {labels?.no ?? customNoText ?? `${capitalize(TRADE_TERM)} No`}
      </Button>

      {open && (
        <Modal
          open={open}
          ariaLabel={`Bet on ${questionTitle ?? contract.question}`}
          setOpen={(open) => {
            setDialogueThatIsOpen(open ? dialogueThatIsOpen : undefined)
          }}
          className={clsx(
            MODAL_CLASS,
            'pointer-events-auto max-h-[32rem] overflow-auto'
          )}
        >
          <Col>
            <h2 className="mb-4 mt-0 text-xl">
              {questionTitle ?? contract.question}
            </h2>
            <BuyPanel
              contract={contract}
              initialOutcome={dialogueThatIsOpen === 'YES' ? 'YES' : 'NO'}
              onBuySuccess={() =>
                setTimeout(() => setDialogueThatIsOpen(undefined), 500)
              }
              location={'feed card'}
              inModal={true}
              feedReason={feedReason}
            />
          </Col>
        </Modal>
      )}
    </div>
  )
}
