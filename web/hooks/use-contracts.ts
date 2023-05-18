import { filterDefined } from 'common/util/array'
import { useEffect, useState } from 'react'
import {
  Contract,
  listenForContract,
  listenForContracts
} from 'web/lib/firebase/contracts'
import { usePersistentState } from './use-persistent-state'
import { useStore, useStoreItems } from './use-store'

export const useAllContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForContracts(setContracts)
  }, [])

  return contracts
}

export const useContract = (contractId: string | undefined) => {
  return useStore(contractId, listenForContract)
}

export const useContracts = (
  contractIds: string[],
  options: { loadOnce?: boolean } = {}
) => {
  return useStoreItems(filterDefined(contractIds), listenForContract, options)
}
