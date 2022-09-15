import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { useEffect, useState } from 'react'
import {
  Contract,
  listenForActiveContracts,
  listenForContracts,
  listenForHotContracts,
  listenForInactiveContracts,
  listenForNewContracts,
  getUserBetContracts,
  getUserBetContractsQuery,
  listAllContracts,
} from 'web/lib/firebase/contracts'
import { QueryClient, useQueryClient } from 'react-query'
import { MINUTE_MS } from 'common/util/time'

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

export const useActiveContracts = () => {
  const [activeContracts, setActiveContracts] = useState<
    Contract[] | undefined
  >()
  const [newContracts, setNewContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForActiveContracts(setActiveContracts)
  }, [])

  useEffect(() => {
    return listenForNewContracts(setNewContracts)
  }, [])

  if (!activeContracts || !newContracts) return undefined

  return [...activeContracts, ...newContracts]
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
