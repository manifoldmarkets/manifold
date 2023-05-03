import { Row } from '../layout/row'
import { Contract } from 'web/lib/firebase/contracts'
import { ContractInfoDialog } from 'web/components/contract/contract-info-dialog'
import { getShareUrl } from 'common/util/share'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { DotsHorizontalIcon } from '@heroicons/react/outline'
import { useState } from 'react'
import { Tooltip } from '../widgets/tooltip'
import { LikeButton } from './like-button'
import clsx from 'clsx'

export function ExtraContractActionsRow(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <Row className="gap-3">
      <div className="flex items-center rounded-full bg-black/60 text-white [&>div]:pr-2">
        <LikeButton
          user={user}
          contract={contract}
          contentId={contract.id}
          contentType="contract"
          contentCreatorId={contract.creatorId}
          totalLikes={contract.likedByUserCount ?? 0}
          contentText={contract.question}
          showTotalLikesUnder
          size="sm"
          color="white"
          className={clsx(
            'p-2',
            isBlocked(privateUser, contract.creatorId) && 'pointer-events-none'
          )}
          trackingLocation={'contract page'}
        />
      </div>

      <CopyLinkButton
        url={getShareUrl(contract, user?.username)}
        linkIconOnlyProps={{
          tooltip: 'Copy market share link',
          //TODO: less spaghetti way of styling the button and icon
          className:
            'rounded-full bg-black/60 !p-2 !text-white hover:bg-black/80 [&_svg]:h-4 [&_svg]:w-4',
        }}
        eventTrackingName="copy market link"
      />

      <Tooltip text="Market details" placement="bottom" noTap>
        <button
          className="rounded-full bg-black/60 p-2 transition-colors hover:bg-black/80"
          onClick={() => setDialogOpen(true)}
        >
          <DotsHorizontalIcon className="h-4 w-4 text-white" aria-hidden />
        </button>
      </Tooltip>
      <ContractInfoDialog
        contract={props.contract}
        user={user}
        open={dialogOpen}
        setOpen={setDialogOpen}
      />
    </Row>
  )
}
