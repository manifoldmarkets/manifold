import { ChartBarIcon, UserIcon } from '@heroicons/react/solid'
import { formatMoney, shortFormatNumber } from 'common/util/format'
import { TbDropletFilled } from 'react-icons/tb'
import { Row } from 'web/components/layout/row'
import { useUser } from 'web/hooks/use-user'
import { Contract } from '../../lib/firebase/contracts'
import { shortenNumber } from '../../lib/util/formatNumber'
import { TierTooltip } from '../tiers/tier-tooltip'
import { Tooltip } from '../widgets/tooltip'
import { BountyLeft } from './bountied-question'
import { CloseOrResolveTime } from './contract-details'
import { CreatorFeesDisplay } from './creator-fees-display'
import { ENV_CONFIG } from 'common/envs/constants'

export function ContractSummaryStats(props: {
  contract: Contract
  editable?: boolean
}) {
  const { contract, editable } = props
  const { viewCount: views, creatorId, marketTier } = contract
  const isCreator = useUser()?.id === creatorId

  return (
    <>
      {contract.outcomeType == 'BOUNTIED_QUESTION' ? (
        <BountyLeft
          bountyLeft={contract.bountyLeft}
          totalBounty={contract.totalBounty}
          inEmbed={true}
        />
      ) : (
        <Row className="gap-4">
          {contract.outcomeType == 'POLL' && (
            <Tooltip
              text={'Voters'}
              placement="bottom"
              noTap
              className="flex flex-row items-center gap-1"
            >
              <UserIcon className="text-ink-500 h-4 w-4" />
              <div>{shortFormatNumber(contract.uniqueBettorCount ?? 0)}</div>
            </Tooltip>
          )}
          {marketTier && <TierTooltip tier={marketTier} contract={contract} />}
          {!!contract.volume && (
            <Tooltip
              text={`Trading volume: ${formatMoney(contract.volume)}`}
              placement="bottom"
              noTap
              className="hidden flex-row items-center gap-1 sm:flex"
            >
              <ChartBarIcon className="text-ink-500 h-4 w-4" />Ṁ
              {shortenNumber(contract.volume)}
            </Tooltip>
          )}

          {(contract.mechanism === 'cpmm-1' ||
            contract.mechanism === 'cpmm-multi-1') && (
            <Tooltip
              text={`Subsidy pool: ${formatMoney(contract.totalLiquidity)}`}
              placement="bottom"
              noTap
              className="flex flex-row items-center gap-1"
            >
              <TbDropletFilled className="text-ink-500 h-4 w-4 stroke-[3]" />
              <div>
                {ENV_CONFIG.moneyMoniker}
                {shortFormatNumber(contract.totalLiquidity)}
              </div>
            </Tooltip>
          )}

          {isCreator && contract.mechanism !== 'none' && (
            <CreatorFeesDisplay contract={contract} />
          )}
          <CloseOrResolveTime contract={contract} editable={editable} />
        </Row>
      )}
    </>
  )
}
