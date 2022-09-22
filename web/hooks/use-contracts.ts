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
  trendingContractsQuery,
  getContractsQuery,
} from 'web/lib/firebase/contracts'
import { QueryClient, useQuery, useQueryClient } from 'react-query'
import { MINUTE_MS } from 'common/util/time'
import { query, limit } from 'firebase/firestore'
import { Sort } from 'web/components/contract-search'
import { dailyScoreIndex } from 'web/lib/service/algolia'
import { CPMMBinaryContract } from 'common/contract'
import { zipObject } from 'lodash'

export const useContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForContracts(setContracts)
  }, [])

  return contracts
}

export const useContractsByDailyScoreGroups = (
  groupSlugs: string[] | undefined
) => {
  const facetFilters = ['isResolved:false']

  const { data } = useQuery(['daily-score', groupSlugs], () =>
    Promise.all(
      (groupSlugs ?? []).map((slug) =>
        dailyScoreIndex.search<CPMMBinaryContract>('', {
          facetFilters: [...facetFilters, `groupLinks.slug:${slug}`],
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

const q = new QueryClient()
export const getCachedContracts = async () =>
  q.fetchQuery(['contracts'], () => listAllContracts(1000), {
    staleTime: Infinity,
  })

export const useTrendingContracts = (maxContracts: number) => {
  const result = useFirestoreQueryData(
    ['trending-contracts', maxContracts],
    query(trendingContractsQuery, limit(maxContracts))
  )
  return result.data
}

export const useContractsQuery = (
  sort: Sort,
  maxContracts: number,
  filters: { groupSlug?: string } = {},
  visibility?: 'public'
) => {
  const result = useFirestoreQueryData(
    ['contracts-query', sort, maxContracts, filters],
    getContractsQuery(sort, maxContracts, filters, visibility)
  )
  return result.data
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
    () => getUserBetContracts(userId),
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
