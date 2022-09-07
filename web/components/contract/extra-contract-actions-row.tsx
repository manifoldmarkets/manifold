import clsx from 'clsx'
import { ShareIcon } from '@heroicons/react/outline'

import { Row } from '../layout/row'
import { Contract } from 'web/lib/firebase/contracts'
import React, { useState } from 'react'
import { Button } from 'web/components/button'
import { useUser } from 'web/hooks/use-user'
import { ShareModal } from './share-modal'
import { FollowMarketButton } from 'web/components/follow-market-button'
import { LikeMarketButton } from 'web/components/contract/like-market-button'
import { ContractInfoDialog } from 'web/components/contract/contract-info-dialog'
import { Col } from 'web/components/layout/col'
import { withTracking } from 'web/lib/service/analytics'
import { CreateChallengeModal } from 'web/components/challenges/create-challenge-modal'
import { CHALLENGES_ENABLED } from 'common/challenge'

export function ExtraContractActionsRow(props: { contract: Contract }) {
  const { contract } = props
  const { outcomeType, resolution } = contract
  const user = useUser()
  const [isShareOpen, setShareOpen] = useState(false)
  const [openCreateChallengeModal, setOpenCreateChallengeModal] =
    useState(false)
  const showChallenge =
    user && outcomeType === 'BINARY' && !resolution && CHALLENGES_ENABLED

  return (
    <Row className={'mt-0.5 justify-around sm:mt-2 lg:justify-start'}>
      <Button
        size="lg"
        color="gray-white"
        className={'flex'}
        onClick={() => {
          setShareOpen(true)
        }}
      >
        <Col className={'items-center sm:flex-row'}>
          <ShareIcon
            className={clsx('h-[24px] w-5 sm:mr-2')}
            aria-hidden="true"
          />
          <span>Share</span>
        </Col>
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
          className="max-w-xs self-center"
          onClick={withTracking(
            () => setOpenCreateChallengeModal(true),
            'click challenge button'
          )}
        >
          <Col className="items-center sm:flex-row">
            <span className="h-[24px] w-5 sm:mr-2" aria-hidden="true">
              ⚔️
            </span>
            <span>Challenge</span>
          </Col>
          <CreateChallengeModal
            isOpen={openCreateChallengeModal}
            setOpen={setOpenCreateChallengeModal}
            user={user}
            contract={contract}
          />
        </Button>
      )}

      <FollowMarketButton contract={contract} user={user} />
      {user?.id !== contract.creatorId && (
        <LikeMarketButton contract={contract} user={user} />
      )}
      <Col className={'justify-center md:hidden'}>
        <ContractInfoDialog contract={contract} />
      </Col>
    </Row>
  )
}
