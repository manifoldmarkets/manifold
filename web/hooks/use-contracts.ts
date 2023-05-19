import { filterDefined } from 'common/util/array'
import { listenForContract } from 'web/lib/firebase/contracts'
import { useStore, useStoreItems } from './use-store'

export const useContract = (contractId: string | undefined) => {
  return useStore(contractId, listenForContract)
}

export const useContracts = (
  contractIds: string[],
  options: { loadOnce?: boolean } = {}
) => {
  return useStoreItems(filterDefined(contractIds), listenForContract, options)
}
