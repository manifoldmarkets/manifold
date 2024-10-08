import { ChartBarIcon, UserIcon } from '@heroicons/react/solid'
import { Contract } from 'common/contract'
import { formatWithToken, shortFormatNumber } from 'common/util/format'
import { Row } from 'web/components/layout/row'
import { TierTooltip } from '../tiers/tier-tooltip'
import { Tooltip } from '../widgets/tooltip'
import { BountyLeft } from './bountied-question'
import { CloseOrResolveTime } from './contract-details'

export function ContractSummaryStats(props: {
  contract: Contract
  editable?: boolean
}) {
  const { contract, editable } = props
  const { outcomeType, marketTier } = contract

  const isCashContract = contract.token === 'CASH'

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
          {marketTier && <TierTooltip tier={marketTier} contract={contract} />}

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
              text={`Trading volume: ${formatWithToken({
                amount: contract.volume,
                token: isCashContract ? 'CASH' : 'M$',
              })}`}
              placement="bottom"
              noTap
              className="flex flex-row items-center gap-1"
            >
              <ChartBarIcon className="text-ink-500 h-4 w-4" />
              {formatWithToken({
                amount: contract.volume,
                token: isCashContract ? 'CASH' : 'M$',
                short: true,
              })}
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
