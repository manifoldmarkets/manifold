import { useBatchedGetter } from 'client-common/hooks/use-batched-getter'
import { Contract } from 'common/contract'
import { queryHandlers } from 'lib/batch-query-handlers'
import { useContractUpdates } from 'client-common/hooks/use-contract-updates'
import { useIsPageVisible } from './use-is-page-visibile'

type ContractOrId = Pick<Contract, 'id'> | Contract

export function useContract(i: ContractOrId | undefined) {
  const isPageVisible = useIsPageVisible()
  const initial = i ?? { id: '_' }

  const [contract, setContract] = useBatchedGetter<ContractOrId>(
    queryHandlers,
    'markets',
    initial.id,
    initial,
    isPageVisible
  )
  useContractUpdates(contract ?? initial, setContract)
  if (!contract) return undefined
  return 'mechanism' in contract ? contract : undefined
}
