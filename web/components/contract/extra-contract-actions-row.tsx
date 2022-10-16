import { Row } from '../layout/row'
import { Contract } from 'web/lib/firebase/contracts'
import { useUser } from 'web/hooks/use-user'
import { FollowMarketButton } from 'web/components/buttons/follow-market-button'
import { LikeItemButton } from 'web/components/contract/like-item-button'
import { ContractInfoDialog } from 'web/components/contract/contract-info-dialog'
import { SimpleLinkButton } from '../buttons/simple-link-button'

export function ExtraContractActionsRow(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()

  return (
    <Row className="gap-1">
      <FollowMarketButton contract={contract} user={user} />

      <LikeItemButton item={contract} user={user} itemType={'contract'} />

      <SimpleLinkButton contract={contract} user={user} />

      <ContractInfoDialog contract={contract} user={user} />
    </Row>
  )
}
