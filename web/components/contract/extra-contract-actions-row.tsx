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

export function ExtraContractActionsRow(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()
  const [isShareOpen, setShareOpen] = useState(false)

  return (
    <Row>
      <FollowMarketButton contract={contract} user={user} />
      {user?.id !== contract.creatorId && (
        <LikeMarketButton contract={contract} user={user} />
      )}
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
        </Row>
        <ShareModal
          isOpen={isShareOpen}
          setOpen={setShareOpen}
          contract={contract}
          user={user}
        />
      </Button>
      <Col className={'justify-center'}>
        <ContractInfoDialog contract={contract} />
      </Col>
    </Row>
  )
}
