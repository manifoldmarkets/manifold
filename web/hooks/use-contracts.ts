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
import { useUser } from './use-user'

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
  const [privateContract, setPrivateContract] = useState<
    Contract<AnyContractType> | undefined | null
  >(undefined)
  const user = useUser()
  useEffect(() => {
    // if there is no user
    if (user === null) {
      setPrivateContract(null)
    } else if (user) {
      // need this timeout (1 sec works) or else get "must be signed in to make API calls" error
      setTimeout(
        () =>
          getPrivateContractBySlug({ contractSlug: contractSlug }).then(
            (result) => {
              setPrivateContract(result as Contract<AnyContractType>)
            }
          ),
        delay
      )
    }
  }, [contractSlug, user])
  return privateContract
}
