import { AnyContractType, CPMMBinaryContract } from 'common/contract'
import { filterDefined } from 'common/util/array'
import { useEffect, useState } from 'react'
import { useQuery } from 'react-query'
import { getPrivateContractBySlug } from 'web/lib/firebase/api'
import {
  Contract,
  listenForContract,
  listenForContracts,
  listenForLiveContracts,
} from 'web/lib/firebase/contracts'
import { trendingIndex } from 'web/lib/service/algolia'
import { inMemoryStore, usePersistentState } from './use-persistent-state'
import { useStore, useStoreItems } from './use-store'
import { useIsAuthorized } from './use-user'

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

export function usePrivateContract(contractSlug: string, delay: number) {
  const [privateContract, setPrivateContract] = usePersistentState<
    Contract<AnyContractType> | undefined | null
  >(undefined, {
    key: 'private-contract-' + contractSlug,
    store: inMemoryStore(),
  })
  const isAuthorized = useIsAuthorized()
  useEffect(() => {
    // if there is no user
    if (isAuthorized === null) {
      setPrivateContract(null)
    } else if (isAuthorized) {
      getPrivateContractBySlug({ contractSlug: contractSlug }).then(
        (result) => {
          setPrivateContract(result as Contract<AnyContractType>)
        }
      )
    }
  }, [contractSlug, isAuthorized])
  return privateContract
}
