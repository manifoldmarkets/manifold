import { ChatIcon, UserIcon } from '@heroicons/react/solid'
import { Contract } from 'common/contract'
import { useNumContractComments } from 'web/hooks/use-comments'
import { shortenNumber } from 'common/util/formatNumber'
import { Row } from '../layout/row'
import { Action } from './contract-table-action'
import { ContractStatusLabel } from './contracts-table'
import { useHasContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { Tooltip } from '../widgets/tooltip'
import { BoostedTooltip } from './boost-column'

export type ColumnFormat = {
  header: string
  content: (props: { contract: Contract }) => JSX.Element
  width: string
}
const TradersColumnComponent = (props: { contract: Contract }) => {
  const { contract } = props
  const { outcomeType, uniqueBettorCount } = contract
  const hasMetric = useHasContractMetrics(contract.id)
  return outcomeType == 'BOUNTIED_QUESTION' ? (
    <div className="text-ink-700 h-min align-top">
      <BountiedContractComments contractId={contract.id} />
    </div>
  ) : (
    <Tooltip
      text={`${contract.uniqueBettorCount} unique traders ${
        hasMetric ? '(including you)' : ''
      }`}
    >
      <div className="text-ink-700 ml-1 h-min align-top">
        <Row className="align-left text-ink-700 h-full shrink-0 items-center justify-start gap-0.5">
          <UserIcon
            className={
              !hasMetric
                ? 'text-ink-400 h-4 w-4 shrink-0'
                : 'text-primary-600 h-4 w-4 shrink-0'
            }
          />
          {shortenNumber(uniqueBettorCount ?? 0)}
        </Row>
      </div>
    </Tooltip>
  )
}
export const traderColumn = {
  header: 'Traders',
  content: TradersColumnComponent,
  width: 'w-[70px]',
}

export const probColumn = {
  header: 'Stat',
  content: (props: { contract: Contract }) => {
    const { contract } = props
    return (
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
    )
  },
  width: 'w-[80px]',
}

// export const tierColumn = {
//   header: 'Tier',
//   content: (props: { contract: Contract }) => {
//     const { contract } = props
//     const marketTier = contract.marketTier
//     return (
//       <TierTooltip
//         placement={'top'}
//         tier={marketTier!}
//         contract={contract}
//         noTitle
//         className="relative mr-0.5 inline-flex h-[1em] w-[1.1em] items-baseline"
//         iconClassName="absolute inset-0 top-[0.2em]"
//       />
//     )
//   },
//   width: 'w-8',
// }

export const boostedColumn = {
  header: 'Boosted',
  content: (props: { contract: Contract }) => {
    const { contract } = props
    return (
      <BoostedTooltip
        boosted={contract.boosted}
        placement={'top'}
        // noTitle
        className="relative mr-0.5 inline-flex h-[1em] w-[1.1em] items-baseline"
        iconClassName="absolute inset-0 top-[0.2em]"
      />
    )
  },
  width: 'w-8',
}

export const actionColumn = {
  header: 'Action',
  content: (props: { contract: Contract }) => (
    <Action contract={props.contract} />
  ),
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
