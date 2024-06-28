import { ChatIcon, UserIcon, ArrowNarrowUpIcon } from '@heroicons/react/solid'
import { Contract } from 'common/contract'
import { useNumContractComments } from 'web/hooks/use-comments'
import { shortenNumber } from 'web/lib/util/formatNumber'
import { Row } from '../layout/row'
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
    const { outcomeType, uniqueBettorCount, uniqueBettorCountDay } = contract

    return outcomeType == 'BOUNTIED_QUESTION' ? (
      <div className="text-ink-700 h-min align-top">
        <BountiedContractComments contractId={contract.id} />
      </div>
    ) : (
      <div className="text-ink-700 ml-1 h-min w-[85px] align-top">
        <Row className="align-center text-ink-700 h-full shrink-0 items-center justify-end gap-0.5">
          <UserIcon className="text-ink-400 h-4 w-4" />
          {shortenNumber(uniqueBettorCount ?? 0)}
          {uniqueBettorCount === uniqueBettorCountDay ? (
            <div className="text-ink-700 ml-1 text-xs">new</div>
          ) : (
            uniqueBettorCountDay > 0 && (
              <>
                <ArrowNarrowUpIcon className="text-ink-600 -mr-[3px] h-4 w-4" />
                <span className="text-sm">{uniqueBettorCountDay}</span>
              </>
            )
          )}
        </Row>
      </div>
    )
  },
  width: 'w-[110px]',
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
      />
    </div>
  ),
  width: 'w-[75px]',
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
