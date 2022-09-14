import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { useEffect, useState } from 'react'
import {
  Contract,
  listenForContracts,
  listenForHotContracts,
  listenForInactiveContracts,
  getUserBetContracts,
  getUserBetContractsQuery,
  trendingContractsQuery,
} from 'web/lib/firebase/contracts'
import { useQueryClient } from 'react-query'
import { MINUTE_MS } from 'common/util/time'
import { query, limit } from 'firebase/firestore'

export const useContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForContracts(setContracts)
  }, [])

  return contracts
}

export const useTrendingContracts = (maxContracts: number) => {
  const result = useFirestoreQueryData(
    ['trending-contracts', maxContracts],
    query(trendingContractsQuery, limit(maxContracts))
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
