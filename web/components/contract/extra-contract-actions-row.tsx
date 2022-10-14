import { ShareIcon } from '@heroicons/react/outline'
import { Row } from '../layout/row'
import { Contract } from 'web/lib/firebase/contracts'
import React, { useState } from 'react'
import { IconButton } from 'web/components/buttons/button'
import { useUser } from 'web/hooks/use-user'
import { ShareModal } from './share-modal'
import { FollowMarketButton } from 'web/components/buttons/follow-market-button'
import { LikeItemButton } from 'web/components/contract/like-item-button'
import { ContractInfoDialog } from 'web/components/contract/contract-info-dialog'
import { Tooltip } from '../widgets/tooltip'

export function ExtraContractActionsRow(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()
  const [isShareOpen, setShareOpen] = useState(false)

  return (
    <Row className="gap-1">
      <FollowMarketButton contract={contract} user={user} />

      <LikeItemButton item={contract} user={user} itemType={'contract'} />

      <Tooltip text="Share" placement="bottom" noTap noFade>
        <IconButton
          size="2xs"
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
        </IconButton>
      </Tooltip>

      <ContractInfoDialog contract={contract} user={user} />
    </Row>
  )
}
