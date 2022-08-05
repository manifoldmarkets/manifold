import clsx from 'clsx'
import { ShareIcon } from '@heroicons/react/outline'

import { Row } from '../layout/row'
import { Contract } from 'web/lib/firebase/contracts'
import { useState } from 'react'
import { Button } from 'web/components/button'
import { CreateChallengeModal } from '../challenges/create-challenge-modal'
import { User } from 'common/user'
import { CHALLENGES_ENABLED } from 'common/challenge'
import { ShareModal } from './share-modal'

export function ShareRow(props: {
  contract: Contract
  user: User | undefined | null
}) {
  const { user, contract } = props
  const { outcomeType, resolution } = contract

  const showChallenge =
    user && outcomeType === 'BINARY' && !resolution && CHALLENGES_ENABLED

  const [isOpen, setIsOpen] = useState(false)
  const [isShareOpen, setShareOpen] = useState(false)

  return (
    <Row className="mt-2">
      <Button
        size="lg"
        color="gray-white"
        className={'flex'}
        onClick={() => {
          setShareOpen(true)
        }}
      >
        <ShareIcon className={clsx('mr-2 h-[24px] w-5')} aria-hidden="true" />
        Share
        <ShareModal
          isOpen={isShareOpen}
          setOpen={setShareOpen}
          contract={contract}
          user={user}
        />
      </Button>

      {showChallenge && (
        <Button
          size="lg"
          color="gray-white"
          onClick={() => setIsOpen(true)}
          className="animate-bounce"
        >
          ⚔️ Challenge
          <CreateChallengeModal
            isOpen={isOpen}
            setOpen={setIsOpen}
            user={user}
            contract={contract}
          />
        </Button>
      )}
    </Row>
  )
}
