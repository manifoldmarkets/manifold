import clsx from 'clsx'
import { EyeIcon, EyeOffIcon, ShareIcon } from '@heroicons/react/outline'

import { Row } from '../layout/row'
import { Contract, contracts } from 'web/lib/firebase/contracts'
import { useState } from 'react'
import { Button } from 'web/components/button'
import { CreateChallengeModal } from '../challenges/create-challenge-modal'
import { User } from 'common/user'
import { CHALLENGES_ENABLED } from 'common/challenge'
import { ShareModal } from './share-modal'
import { withTracking } from 'web/lib/service/analytics'
import { collection, deleteDoc, doc } from 'firebase/firestore'
import { useContractFollows } from 'web/hooks/use-follows'

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
  const followers = useContractFollows(contract.id)

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
          onClick={withTracking(
            () => setIsOpen(true),
            'click challenge button'
          )}
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
      {user && (
        <Button
          size={'lg'}
          color={'gray-white'}
          onClick={async () => {
            // remove user doc from contract follows collection
            const followDoc = doc(
              collection(contracts, contract.id, 'follows'),
              user.id
            )
            await deleteDoc(followDoc)
          }}
        >
          {followers?.includes(user.id) ? (
            <Row>
              <EyeOffIcon
                className={clsx('mr-2 h-[24px] w-5')}
                aria-hidden="true"
              />
              Unfollow
            </Row>
          ) : (
            <Row>
              <EyeIcon
                className={clsx('mr-2 h-[24px] w-5')}
                aria-hidden="true"
              />
              Follow
            </Row>
          )}
        </Button>
      )}
    </Row>
  )
}
