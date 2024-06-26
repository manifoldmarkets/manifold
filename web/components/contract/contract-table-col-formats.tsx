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
      <div className="text-ink-700 ml-1 h-min w-[75px] align-top">
        <Row className="align-center h-full shrink-0 items-center justify-end gap-0.5">
          <UserIcon className="text-ink-400 h-4 w-4" />
          {shortenNumber(uniqueBettorCount ?? 0)}
          {uniqueBettorCount === uniqueBettorCountDay ? (
            <div className="ml-1 rounded-md border border-teal-500 px-1 py-0.5 text-xs text-teal-500">
              new
            </div>
          ) : (
            uniqueBettorCountDay > 0 && (
              <>
                <ArrowNarrowUpIcon className="-mr-1 h-4 w-4 text-teal-500" />
                <span className="text-sm text-teal-500">
                  {uniqueBettorCountDay}
                </span>
              </>
            )
          )}
        </Row>
      </div>
    )
  },
  width: 'w-[100px]',
}

export const probColumn = {
  header: 'Stat',
  content: (contract: Contract) => (
    <div className="font-semibold">
      <ContractStatusLabel
        contract={contract}
        className="block w-[3ch] text-right"
      />
    </div>
  ),
  width: 'w-16',
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
