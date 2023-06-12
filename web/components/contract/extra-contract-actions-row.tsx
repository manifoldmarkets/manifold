import { Row } from '../layout/row'
import { Contract } from 'web/lib/firebase/contracts'
import { ContractInfoDialog } from 'web/components/contract/contract-info-dialog'
import { getShareUrl } from 'common/util/share'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { DotsHorizontalIcon } from '@heroicons/react/outline'
import { ReactNode, useState } from 'react'
import { Tooltip } from '../widgets/tooltip'
import { LikeButton } from './like-button'
import clsx from 'clsx'
import { DotsVerticalIcon } from '@heroicons/react/solid'

export function ExtraContractActionsRow(props: {
  contract: Contract
  children?: ReactNode
}) {
  const { contract, children } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const [dialogOpen, setDialogOpen] = useState(false)
  const hasCoverImage = !!contract.coverImageUrl

  return (
    <Row>
      {children}

      <div className={clsx('flex items-center [&>div]:pr-2')}>
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
          color={'gray'}
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
            '!p-2 [&_svg]:h-4 [&_svg]:w-4 text-ink-500 hover:text-ink-600',
        }}
        eventTrackingName="copy market link"
      />

      <Tooltip text="Market details" placement="bottom" noTap>
        <button
          className={clsx(
            'text-ink-500 hover:text-ink-600 p-2 transition-colors',
            hasCoverImage
          )}
          onClick={() => setDialogOpen(true)}
        >
          <DotsVerticalIcon className={clsx('h-4 w-4')} aria-hidden />
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
