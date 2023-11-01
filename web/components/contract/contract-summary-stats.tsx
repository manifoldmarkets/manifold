import { Contract } from 'common/contract'
import { Tooltip } from '../widgets/tooltip'
import { ChartBarIcon, UserIcon } from '@heroicons/react/solid'
import {
  formatMoney,
  formatWithCommas,
  shortFormatNumber,
} from 'common/util/format'
import { TbDroplet } from 'react-icons/tb'
import { ENV_CONFIG } from 'common/envs/constants'
import { CloseOrResolveTime } from './contract-details'
import { BountyLeft } from './bountied-question'

export function ContractSummaryStats(props: {
  contract: Contract
  editable?: boolean
}) {
  const { contract, editable } = props
  return (
    <>
      {contract.outcomeType == 'BOUNTIED_QUESTION' ? (
        <BountyLeft
          bountyLeft={contract.bountyLeft}
          totalBounty={contract.totalBounty}
          inEmbed={true}
        />
      ) : (
        <div className="flex gap-4">
          <Tooltip
            text={contract.outcomeType == 'POLL' ? 'Voters' : 'Traders'}
            placement="bottom"
            noTap
            className="flex flex-row items-center gap-1"
          >
            <UserIcon className="text-ink-500 h-4 w-4" />
            <div>{formatWithCommas(contract.uniqueBettorCount ?? 0)}</div>
          </Tooltip>

          {!!contract.volume && (
            <Tooltip
              text={`Trading volume: ${formatMoney(contract.volume)}`}
              placement="bottom"
              noTap
              className="hidden flex-row items-center gap-1 sm:flex"
            >
              <ChartBarIcon className="text-ink-500 h-4 w-4" />Ṁ
              {shortFormatNumber(contract.volume)}
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
              <TbDroplet className="stroke-ink-500 h-4 w-4 stroke-[3]" />
              <div>
                {ENV_CONFIG.moneyMoniker}
                {shortFormatNumber(contract.totalLiquidity)}
              </div>
            </Tooltip>
          )}

          <CloseOrResolveTime contract={contract} editable={editable} />
        </div>
      )}
    </>
  )
}
