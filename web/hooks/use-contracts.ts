import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { useEffect, useState } from 'react'
import {
  Contract,
  listenForContracts,
  getUserBetContracts,
  getUserBetContractsQuery,
  listenForContract,
  listenForLiveContracts,
} from 'web/lib/firebase/contracts'
import { useQuery, useQueryClient } from 'react-query'
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
import { filterDefined } from 'common/util/array'
import { useUser } from './use-user'
import { getCanAccessContract } from 'web/lib/firebase/api'

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

export const useNewContracts = (
  maxContracts: number,
  additionalFilters?: (string | string[])[],
  active = true
) => {
  const { data } = useQuery(
    ['newest-contracts', maxContracts, additionalFilters],
    () =>
      !active
        ? undefined
        : newIndex.search<CPMMBinaryContract>('', {
            facetFilters: defaultFilters.concat(additionalFilters ?? []),
            hitsPerPage: maxContracts,
          })
  )
  if (!data) return undefined
  return data.hits
}

export const useContractsByDailyScore = (
  maxContracts: number,
  additionalFilters?: (string | string[])[],
  active = true
) => {
  const { data } = useQuery(
    ['daily-score', maxContracts, additionalFilters],
    () =>
      !active
        ? undefined
        : dailyScoreIndex.search<CPMMBinaryContract>('', {
            facetFilters: defaultFilters.concat(additionalFilters ?? []),
            hitsPerPage: maxContracts,
          })
  )
  if (!data) return undefined
  return data.hits.filter((c) => c.dailyScore)
}

export const useContractsByDailyScoreGroups = (
  groupSlugs: string[] | undefined,
  count: number,
  additionalFilters?: string[],
  active = true
) => {
  const { data } = useQuery(
    ['daily-score', groupSlugs, additionalFilters],
    () =>
      !active
        ? undefined
        : Promise.all(
            (groupSlugs ?? []).map((slug) =>
              dailyScoreIndex.search<CPMMBinaryContract>('', {
                facetFilters: [
                  'isResolved:false',
                  `groupLinks.slug:${slug}`,
                ].concat(additionalFilters ?? []),
                hitsPerPage: count,
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
  return useStoreItems(filterDefined(contractIds), listenForContract, options)
}

export function useCanAccessContract(contractSlug: string, delay: number) {
  const [canAccess, setCanAccess] = useState<any>(undefined)
  const user = useUser()
  useEffect(() => {
    // if there is no user
    if (user === null) {
      setCanAccess(false)
    } else if (user) {
      // need this timeout (1 sec works) or else get "must be signed in to make API calls" error
      setTimeout(
        () =>
          getCanAccessContract({ contractSlug: contractSlug }).then(
            (result) => {
              setCanAccess(result)
            }
          ),
        delay
      )
    }
  }, [contractSlug, user])
  return canAccess
}
