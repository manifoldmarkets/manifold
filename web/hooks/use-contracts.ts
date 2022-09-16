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
import { QueryClient, useQueryClient } from 'react-query'
import { MINUTE_MS } from 'common/util/time'
import { query, limit } from 'firebase/firestore'
import { Sort } from 'web/components/contract-search'

export const useContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForContracts(setContracts)
  }, [])

  return contracts
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
  filters: { groupSlug?: string } = {}
) => {
  const result = useFirestoreQueryData(
    ['contracts-query', sort, maxContracts, filters],
    getContractsQuery(sort, maxContracts, filters)
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
