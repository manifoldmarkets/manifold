import { useEffect, useState } from 'react'
import {
  Contract,
  listenForContracts,
  listenForContract,
  listenForLiveContracts,
} from 'web/lib/firebase/contracts'
import { useQuery } from 'react-query'
import { trendingIndex } from 'web/lib/service/algolia'
import { CPMMBinaryContract } from 'common/contract'
import { inMemoryStore, usePersistentState } from './use-persistent-state'
import { useStore, useStoreItems } from './use-store'
import { filterDefined } from 'common/util/array'

export const useAllContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForContracts(setContracts)
  }, [])

  return contracts
}

const defaultFilters: (string | string[])[] = [
  'isResolved:false',
  'visibility:public',
]

export const useTrendingContracts = (
  maxContracts: number,
  additionalFilters?: (string | string[])[],
  active = true
) => {
  const { data } = useQuery(
    ['trending-contracts', maxContracts, additionalFilters],
    () =>
      !active
        ? undefined
        : trendingIndex.search<CPMMBinaryContract>('', {
            facetFilters: defaultFilters.concat(additionalFilters ?? []),
            hitsPerPage: maxContracts,
          })
  )
  if (!data) return undefined
  return data.hits
}

export const useLiveContracts = (count: number) => {
  const [contracts, setContracts] = usePersistentState<Contract[] | undefined>(
    undefined,
    {
      store: inMemoryStore(),
      key: `liveContracts-${count}`,
    }
  )

  useEffect(() => {
    return listenForLiveContracts(count, setContracts)
  }, [count, setContracts])

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
