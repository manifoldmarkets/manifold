import { Row } from '../layout/row'
import { Contract } from 'web/lib/firebase/contracts'
import { useUser } from 'web/hooks/use-user'
import { FollowMarketButton } from 'web/components/buttons/follow-market-button'
import { LikeItemButton } from 'web/components/contract/like-item-button'
import { ContractInfoDialog } from 'web/components/contract/contract-info-dialog'
import { SimpleLinkButton } from '../buttons/simple-link-button'
import { getShareUrl } from 'common/util/share'

export function ExtraContractActionsRow(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()

  return (
    <Row className="gap-1">
      <FollowMarketButton contract={contract} user={user} />

      <LikeItemButton item={contract} user={user} itemType={'contract'} />

      <SimpleLinkButton getUrl={() => getShareUrl(contract, user?.username)} />

      <ContractInfoDialog contract={contract} user={user} />
    </Row>
  )
}
