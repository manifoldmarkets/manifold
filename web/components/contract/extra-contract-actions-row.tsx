import clsx from 'clsx'
import { ShareIcon } from '@heroicons/react/outline'

import { Row } from '../layout/row'
import { Contract } from 'web/lib/firebase/contracts'
import { useState } from 'react'
import { Button } from 'web/components/button'
import { User } from 'common/user'
import { ShareModal } from './share-modal'
import { FollowMarketButton } from 'web/components/follow-market-button'
import { LikeMarketButton } from 'web/components/contract/like-market-button'
import { ContractInfoDialog } from 'web/components/contract/contract-info-dialog'
import { Bet } from 'common/bet'
import { Col } from 'web/components/layout/col'

export function ExtraContractActionsRow(props: {
  contract: Contract
  bets: Bet[]
  user: User | undefined | null
}) {
  const { user, contract, bets } = props

  const [isShareOpen, setShareOpen] = useState(false)

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

      <FollowMarketButton contract={contract} user={user} />
      <LikeMarketButton contract={contract} user={user} />
      <Col className={'justify-center md:hidden'}>
        <ContractInfoDialog contract={contract} bets={bets} />
      </Col>
    </Row>
  )
}
