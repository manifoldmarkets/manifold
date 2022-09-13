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
import ChallengeIcon from 'web/lib/icons/challenge-icon'

export function ExtraContractActionsRow(props: { contract: Contract }) {
  const { contract } = props
  const { outcomeType, resolution } = contract
  const user = useUser()
  const [isShareOpen, setShareOpen] = useState(false)
  const [openCreateChallengeModal, setOpenCreateChallengeModal] =
    useState(false)
  // const showChallenge =
  //   user && outcomeType === 'BINARY' && !resolution && CHALLENGES_ENABLED

  return (
    <Row>
      {/* <FollowMarketButton contract={contract} user={user} />
      {user?.id !== contract.creatorId && (
        <LikeMarketButton contract={contract} user={user} />
      )} */}
      <Button
        size="sm"
        color="gray-white"
        className={'flex'}
        onClick={() => {
          setShareOpen(true)
        }}
      >
        <Row>
          <ShareIcon className={clsx('h-5 w-5')} aria-hidden="true" />
          {/* <span className="hidden sm:block">Share</span> */}
        </Row>
        <ShareModal
          isOpen={isShareOpen}
          setOpen={setShareOpen}
          contract={contract}
          user={user}
        />
      </Button>

      {/* {showChallenge && (
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
            <ChallengeIcon className="mx-auto h-[24px] w-5 text-gray-500 sm:mr-2" />
            <span>Challenge</span>
          </Col>
          <CreateChallengeModal
            isOpen={openCreateChallengeModal}
            setOpen={setOpenCreateChallengeModal}
            user={user}
            contract={contract}
          />
        </Button>
      )} */}
      <Col className={'justify-center'}>
        <ContractInfoDialog contract={contract} />
      </Col>
    </Row>
  )
}
