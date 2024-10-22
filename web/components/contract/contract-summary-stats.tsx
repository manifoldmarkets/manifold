import { ChartBarIcon, UserIcon } from '@heroicons/react/solid'
import { Contract } from 'common/contract'
import { formatWithToken, shortFormatNumber } from 'common/util/format'
import { Row } from 'web/components/layout/row'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { TierTooltip } from '../tiers/tier-tooltip'
import { Tooltip } from '../widgets/tooltip'
import { BountyLeft } from './bountied-question'
import { CloseOrResolveTime } from './contract-details'
import { LikeButton } from './like-button'
import { MoneyDisplay } from '../bet/money-display'

export function ContractSummaryStats(props: {
  contractId: string
  creatorId: string
  question: string
  financeContract: Contract
  editable?: boolean
  isCashContract?: boolean
}) {
  const {
    contractId,
    creatorId,
    question,
    financeContract: contract,
    editable,
    isCashContract,
  } = props
  const { outcomeType, marketTier } = contract
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
        <Row className="ml-auto gap-4">
          {marketTier && <TierTooltip tier={marketTier} contract={contract} />}
          {!isBlocked(privateUser, contract.creatorId) && (
            <LikeButton
              user={user}
              size={'2xs'}
              contentId={contractId}
              contentType="contract"
              contentCreatorId={creatorId}
              contentText={question}
              trackingLocation={'contract page'}
            />
          )}
          <Tooltip
            text={outcomeType == 'POLL' ? 'Voters' : 'Traders'}
            placement="bottom"
            noTap
            className="flex flex-row items-center gap-0.5"
          >
            <UserIcon className="text-ink-500 h-4 w-4" />
            <div>{shortFormatNumber(contract.uniqueBettorCount ?? 0)}</div>
          </Tooltip>

          {!!contract.volume && (
            <Tooltip
              text={`Trading volume: ${formatWithToken({
                amount: contract.volume,
                token: isCashContract ? 'CASH' : 'M$',
              })}`}
              placement="bottom"
              noTap
              className="flex flex-row items-center gap-0.5"
            >
              <ChartBarIcon className="text-ink-500 h-4 w-4" />
              <MoneyDisplay
                amount={contract.volume}
                isCashContract={!!isCashContract}
                numberType="short"
              />
            </Tooltip>
          )}

          {/* {isCreator && contract.mechanism !== 'none' && (
            <CreatorFeesDisplay contract={contract} />
          )} */}
          <CloseOrResolveTime contract={contract} editable={editable} />
        </Row>
      )}
    </>
  )
}
