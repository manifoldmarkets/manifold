import { useBatchedGetter } from 'client-common/hooks/use-batched-getter'
import { Contract } from 'common/contract'
import { queryHandlers } from 'lib/batch-query-handlers'
import { useContractUpdates } from 'client-common/hooks/use-contract-updates'
import { useIsPageVisible } from './use-is-page-visibile'

type ContractOrId = Pick<Contract, 'id'> | Contract
export function useContract(initial: ContractOrId | undefined) {
  if (!initial) return undefined

  const isPageVisible = useIsPageVisible()

  const [contract, setContract] = useBatchedGetter<ContractOrId>(
    queryHandlers,
    'markets',
    initial.id,
    initial,
    isPageVisible && initial !== null
  )
  useContractUpdates(contract ?? initial, setContract)
  return 'mechanism' in contract ? contract : undefined
}
