import { ChatIcon, UserIcon } from '@heroicons/react/solid'
import { Contract } from 'common/contract'
import { SWEEPIES_MARKET_TOOLTIP } from 'common/envs/constants'
import { useNumContractComments } from 'web/hooks/use-comments'
import { shortenNumber } from 'web/lib/util/formatNumber'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { Row } from '../layout/row'
import { TierTooltip } from '../tiers/tier-tooltip'
import { Tooltip } from '../widgets/tooltip'
import { Action } from './contract-table-action'
import { ContractStatusLabel } from './contracts-table'

export type ColumnFormat = {
  header: string
  content: (c: Contract) => JSX.Element
  width: string
}

export const traderColumn = {
  header: 'Traders',
  content: (contract: Contract) => {
    const { outcomeType, uniqueBettorCount } = contract

    return outcomeType == 'BOUNTIED_QUESTION' ? (
      <div className="text-ink-700 h-min align-top">
        <BountiedContractComments contractId={contract.id} />
      </div>
    ) : (
      <div className="text-ink-700 mr-7 h-min  align-top">
        <Row className="align-center text-ink-700 h-full shrink-0 items-center justify-end gap-0.5">
          <UserIcon className="text-ink-400 h-4 w-4" />
          {shortenNumber(uniqueBettorCount ?? 0)}
        </Row>
      </div>
    )
  },
  width: 'w-[90px]',
}

export const probColumn = {
  header: 'Stat',
  content: (contract: Contract) => (
    <div className="font-semibold">
      <ContractStatusLabel
        contract={contract}
        showProbChange={
          contract.uniqueBettorCountDay !== contract.uniqueBettorCount
        }
        className="block w-[3ch] text-right"
        width={'w-[65px]'}
      />
    </div>
  ),
  width: 'w-[80px]',
}

export const tierColumn = {
  header: 'Tier',
  content: (contract: Contract) => {
    const marketTier = contract.marketTier
    return (
      <TierTooltip
        placement={'top'}
        tier={marketTier!}
        contract={contract}
        noTitle
        className="relative mr-0.5 inline-flex h-[1em] w-[1.1em] items-baseline"
        iconClassName="absolute inset-0 top-[0.2em]"
      />
    )
  },
  width: 'w-8',
}

export const actionColumn = {
  header: 'Action',
  content: (contract: Contract) => <Action contract={contract} />,
  width: 'w-12',
}

function BountiedContractComments(props: { contractId: string }) {
  const { contractId } = props
  const numComments = useNumContractComments(contractId)
  return (
    <Row className="align-center shrink-0 items-center gap-0.5">
      <ChatIcon className="h-4 w-4" />
      {numComments}
    </Row>
  )
}
