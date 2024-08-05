import { ChartBarIcon, UserIcon } from '@heroicons/react/solid'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { Row } from 'web/components/layout/row'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { shortenNumber } from '../../lib/util/formatNumber'
import { TierTooltip } from '../tiers/tier-tooltip'
import { Tooltip } from '../widgets/tooltip'
import { BountyLeft } from './bountied-question'
import { CloseOrResolveTime } from './contract-details'
import { CreatorFeesDisplay } from './creator-fees-display'
import { Contract } from 'common/contract'
import { LikeButton } from './like-button'
import { RepostButton } from '../comments/repost-modal'

export function TwombaContractSummaryStats(props: {
  contract: Contract
  editable?: boolean
}) {
  const { contract, editable } = props
  const { creatorId, outcomeType, marketTier } = contract
  const isCreator = useUser()?.id === creatorId
  const privateUser = usePrivateUser()
  const user = useUser()

  return (
    <>
      {outcomeType == 'BOUNTIED_QUESTION' ? (
        <BountyLeft
          bountyLeft={contract.bountyLeft}
          totalBounty={contract.totalBounty}
          inEmbed={true}
        />
      ) : (
        <Row className="gap-4">
          <Tooltip
            text={outcomeType == 'POLL' ? 'Voters' : 'Traders'}
            placement="bottom"
            noTap
            className="flex flex-row items-center gap-1"
          >
            <UserIcon className="text-ink-500 h-4 w-4" />
            <div>{shortFormatNumber(contract.uniqueBettorCount ?? 0)}</div>
          </Tooltip>

          {!!contract.volume && (
            <Tooltip
              text={`Trading volume: ${formatMoney(contract.volume)}`}
              placement="bottom"
              noTap
              className="flex flex-row items-center gap-1"
            >
              <ChartBarIcon className="text-ink-500 h-4 w-4" />Ṁ
              {shortenNumber(contract.volume)}
            </Tooltip>
          )}

          {isCreator && contract.mechanism !== 'none' && (
            <CreatorFeesDisplay contract={contract} />
          )}
          <CloseOrResolveTime contract={contract} editable={editable} />
          {<RepostButton size="xs" contract={contract} />}
          {!isBlocked(privateUser, contract.creatorId) && (
            <LikeButton
              user={user}
              size={'xs'}
              contentId={contract.id}
              contentType="contract"
              contentCreatorId={contract.creatorId}
              contentText={contract.question}
              trackingLocation={'contract page'}
            />
          )}
          {marketTier && marketTier !== 'basic' && (
            <TierTooltip tier={marketTier} contract={contract} />
          )}
        </Row>
      )}
    </>
  )
}
