import { LinkIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import toast from 'react-hot-toast'

import { Row } from '../layout/row'
import { Contract, contractPath } from 'web/lib/firebase/contracts'
import { useState } from 'react'
import { ENV_CONFIG } from 'common/envs/constants'
import { Button } from 'web/components/button'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'
import { CreateChallengeModal } from '../challenges/create-challenge-modal'
import { User } from 'common/user'
import { CHALLENGES_ENABLED } from 'common/challenge'

export function ShareRow(props: {
  contract: Contract
  user: User | undefined | null
}) {
  const { user, contract } = props
  const { outcomeType, resolution } = contract

  const showChallenge =
    user && outcomeType === 'BINARY' && !resolution && CHALLENGES_ENABLED

  const copyPayload = `https://${ENV_CONFIG.domain}${contractPath(contract)}${
    user?.username && contract.creatorUsername !== user?.username
      ? '?referrer=' + user?.username
      : ''
  }`

  const linkIcon = (
    <LinkIcon className={clsx('mr-2 h-[24px] w-5')} aria-hidden="true" />
  )

  const [isOpen, setIsOpen] = useState(false)

  return (
    <Row className="mt-2">
      <Button
        size="lg"
        color="gray-white"
        className={'flex'}
        onClick={() => {
          copyToClipboard(copyPayload)
          track('copy share link')
          toast.success('Link copied!', {
            icon: linkIcon,
          })
        }}
      >
        {linkIcon} Share
      </Button>

      {showChallenge && (
        <Button size="lg" color="gray-white" onClick={() => setIsOpen(true)}>
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
