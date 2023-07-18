import { DotsVerticalIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { getShareUrl } from 'common/util/share'
import { ReactNode, useState } from 'react'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { ContractInfoDialog } from 'web/components/contract/contract-info-dialog'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { Contract } from 'web/lib/firebase/contracts'
import { Row } from '../layout/row'
import { Tooltip } from '../widgets/tooltip'
import { LikeButton } from './like-button'

export function ExtraContractActionsRow(props: {
  contract: Contract
  children?: ReactNode
  className?: string
}) {
  const { contract, children, className } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const [dialogOpen, setDialogOpen] = useState(false)
  const hasCoverImage = !!contract.coverImageUrl

  return (
    <Row className={className}>
      {children}

      <div className={'flex items-center'}>
        <LikeButton
          user={user}
          contract={contract}
          contentId={contract.id}
          contentType="contract"
          contentCreatorId={contract.creatorId}
          totalLikes={contract.likedByUserCount ?? 0}
          contentText={contract.question}
          color={'gray'}
          className={clsx(
            isBlocked(privateUser, contract.creatorId) && 'pointer-events-none'
          )}
          trackingLocation={'contract page'}
        />
      </div>

      <CopyLinkButton
        url={getShareUrl(contract, user?.username)}
        linkIconOnlyProps={{
          tooltip: 'Copy question share link',
          //TODO: less spaghetti way of styling the button and icon
          className: 'text-ink-500 hover:text-ink-600',
        }}
        eventTrackingName="copy market link"
      />

      <Tooltip text="Question details" placement="bottom" noTap>
        <button
          className={clsx(
            'text-ink-500 hover:text-ink-600 p-2 transition-colors',
            hasCoverImage
          )}
          onClick={() => setDialogOpen(true)}
        >
          <DotsVerticalIcon className={clsx('h-5 w-5')} aria-hidden />
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
