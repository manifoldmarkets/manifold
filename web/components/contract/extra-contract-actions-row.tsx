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
import { Tooltip } from '../tooltip'

export function ExtraContractActionsRow(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()
  const [isShareOpen, setShareOpen] = useState(false)

  return (
    <Row>
      <FollowMarketButton contract={contract} user={user} />

      <LikeMarketButton contract={contract} user={user} />

      <Tooltip text="Share" placement="bottom" noTap noFade>
        <Button
          size="sm"
          color="gray-white"
          className={'flex'}
          onClick={() => setShareOpen(true)}
        >
          <ShareIcon className="h-5 w-5" aria-hidden />
          <ShareModal
            isOpen={isShareOpen}
            setOpen={setShareOpen}
            contract={contract}
            user={user}
          />
        </Button>
      </Tooltip>

      <ContractInfoDialog contract={contract} user={user} />
    </Row>
  )
}
