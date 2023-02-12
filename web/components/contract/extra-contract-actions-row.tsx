import { Row } from '../layout/row'
import { Contract } from 'web/lib/firebase/contracts'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { LikeButton } from 'web/components/contract/like-button'
import { ContractInfoDialog } from 'web/components/contract/contract-info-dialog'
import { getShareUrl } from 'common/util/share'
import clsx from 'clsx'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'

export function ExtraContractActionsRow(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()
  const privateUser = usePrivateUser()

  return (
    <Row className="gap-1">
      <LikeButton
        contentId={contract.id}
        contentCreatorId={contract.creatorId}
        user={user}
        contentType={'contract'}
        totalLikes={contract.likedByUserCount ?? 0}
        contract={contract}
        contentText={contract.question}
        className={clsx(
          'mt-1 !items-start',
          isBlocked(privateUser, contract.creatorId) && 'pointer-events-none'
        )}
      />

      <CopyLinkButton
        url={getShareUrl(contract, user?.username)}
        linkIconOnlyProps={{
          tooltip: 'Copy link to market',
        }}
      />

      <ContractInfoDialog contract={contract} user={user} />
    </Row>
  )
}
