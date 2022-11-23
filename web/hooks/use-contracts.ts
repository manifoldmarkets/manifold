import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { useEffect, useState } from 'react'
import {
  Contract,
  listenForContracts,
  listenForHotContracts,
  listenForInactiveContracts,
  getUserBetContracts,
  getUserBetContractsQuery,
  listAllContracts,
  listenForContract,
  listenForLiveContracts,
} from 'web/lib/firebase/contracts'
import { QueryClient, useQuery, useQueryClient } from 'react-query'
import { MINUTE_MS, sleep } from 'common/util/time'
import {
  dailyScoreIndex,
  newIndex,
  trendingIndex,
} from 'web/lib/service/algolia'
import { CPMMBinaryContract } from 'common/contract'
import { zipObject } from 'lodash'
import { inMemoryStore, usePersistentState } from './use-persistent-state'
import { useStore, useStoreItems } from './use-store'

export const useAllContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForContracts(setContracts)
  }, [])

  return contracts
}

export const useTrendingContracts = (
  maxContracts: number,
  additionalFilters?: string[]
) => {
  const { data } = useQuery(['trending-contracts', maxContracts], () =>
    trendingIndex.search<CPMMBinaryContract>('', {
      facetFilters: ['isResolved:false', 'visibility:public'].concat(
        additionalFilters ?? []
      ),
      hitsPerPage: maxContracts,
    })
  )
  if (!data) return undefined
  return data.hits
}

export const useNewContracts = (
  maxContracts: number,
  additionalFilters?: string[]
) => {
  const { data } = useQuery(['newest-contracts', maxContracts], () =>
    newIndex.search<CPMMBinaryContract>('', {
      facetFilters: ['isResolved:false', 'visibility:public'].concat(
        additionalFilters ?? []
      ),
      hitsPerPage: maxContracts,
    })
  )
  if (!data) return undefined
  return data.hits
}

export const useContractsByDailyScoreNotBetOn = (
  maxContracts: number,
  additionalFilters?: string[]
) => {
  const { data } = useQuery(['daily-score', maxContracts], () =>
    dailyScoreIndex.search<CPMMBinaryContract>('', {
      facetFilters: ['isResolved:false', 'visibility:public'].concat(
        additionalFilters ?? []
      ),
      hitsPerPage: maxContracts,
    })
  )
  if (!data) return undefined
  return data.hits.filter((c) => c.dailyScore)
}

export const useContractsByDailyScoreGroups = (
  groupSlugs: string[] | undefined,
  additionalFilters?: string[]
) => {
  const { data } = useQuery(['daily-score', groupSlugs], () =>
    Promise.all(
      (groupSlugs ?? []).map((slug) =>
        dailyScoreIndex.search<CPMMBinaryContract>('', {
          facetFilters: ['isResolved:false', `groupLinks.slug:${slug}`].concat(
            additionalFilters ?? []
          ),
          hitsPerPage: 10,
        })
      )
    )
  )
  if (!groupSlugs || !data || data.length !== groupSlugs.length)
    return undefined

  return zipObject(
    groupSlugs,
    data.map((d) => d.hits.filter((c) => c.dailyScore))
  )
}

export const useInactiveContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForInactiveContracts(setContracts)
  }, [])

  return contracts
}

export const useHotContracts = () => {
  const [hotContracts, setHotContracts] = useState<Contract[] | undefined>()

  useEffect(() => listenForHotContracts(setHotContracts), [])

  return hotContracts
}

export const usePrefetchUserBetContracts = (userId: string) => {
  const queryClient = useQueryClient()
  return queryClient.prefetchQuery(
    ['contracts', 'bets', userId],
    () => sleep(1000).then(() => getUserBetContracts(userId)),
    { staleTime: 5 * MINUTE_MS }
  )
}

export const useUserBetContracts = (userId: string) => {
  const result = useFirestoreQueryData(
    ['contracts', 'bets', userId],
    getUserBetContractsQuery(userId)
  )
  return result.data
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
  return useStoreItems(contractIds, listenForContract, options)
}
