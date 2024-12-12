import clsx from 'clsx'
import { useState } from 'react'

import { track } from 'web/lib/service/analytics'
import { BinaryContract, StonkContract } from 'common/contract'
import { User, firebaseLogin } from 'web/lib/firebase/users'
import { TRADE_TERM } from 'common/envs/constants'
import { capitalize } from 'lodash'
import { Button } from 'web/components/buttons/button'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { BuyPanel } from 'web/components/bet/bet-panel'
import { Col } from 'web/components/layout/col'
import { BsFillHandThumbsUpFill } from 'react-icons/bs'
import { BsFillHandThumbsDownFill } from 'react-icons/bs'

export function StonkBetButton(props: {
  contract: BinaryContract | StonkContract
  user: User | null | undefined
  feedReason?: string
  className?: string
  labels?: { yes: string; no: string }
}) {
  const { contract, labels, user, className, feedReason } = props
  const { closeTime } = contract
  const isClosed = closeTime && closeTime < Date.now()
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
        color="green-transparent"
        size="xs"
        onClick={() => handleBetButtonClick('YES')}
        className="mr-2"
      >
        <BsFillHandThumbsUpFill className="mr-1 h-4 w-4" /> Yay
      </Button>

      <Button
        color="red-transparent"
        size="xs"
        onClick={() => handleBetButtonClick('NO')}
      >
        <BsFillHandThumbsDownFill className="mr-1 h-4 w-4" />
        Nay
      </Button>

      {open && (
        <Modal
          open={open}
          setOpen={(open) => {
            setDialogueThatIsOpen(open ? dialogueThatIsOpen : undefined)
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
