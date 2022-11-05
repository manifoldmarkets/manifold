import { useQueryClient } from 'react-query'
import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { useEffect, useState } from 'react'
import {
  Bet,
  getSwipes,
  getUserBets,
  getUserBetsQuery,
  listenForBets,
} from 'web/lib/firebase/bets'
import { MINUTE_MS, sleep } from 'common/util/time'
import { useUser } from './use-user'

export const usePrefetchUserBets = (userId: string) => {
  const queryClient = useQueryClient()
  return queryClient.prefetchQuery(
    ['bets', userId],
    () => sleep(1000).then(() => getUserBets(userId)),
    { staleTime: MINUTE_MS }
  )
}

export const useUserBets = (userId: string) => {
  const result = useFirestoreQueryData(
    ['bets', userId],
    getUserBetsQuery(userId)
  )
  return result.data
}

export const useUserContractBets = (
  userId: string | undefined,
  contractId: string | undefined
) => {
  const [bets, setBets] = useState<Bet[] | undefined>(undefined)

  useEffect(() => {
    if (userId && contractId)
      return listenForBets(
        contractId,
        (bets) => setBets(bets.sort((b) => b.createdTime)),
        { userId: userId }
      )
  }, [userId, contractId])

  return bets
}

export const useGetUserBetContractIds = (userId: string | undefined) => {
  const [contractIds, setContractIds] = useState<string[] | undefined>()

  useEffect(() => {
    if (userId) {
      const key = `user-bet-contractIds-${userId}`
      const userBetContractJson = localStorage.getItem(key)
      if (userBetContractJson) {
        setContractIds(JSON.parse(userBetContractJson))
      }
    }
  }, [userId])

  return contractIds
}

export const useUserSwipes = () => {
  const user = useUser()
  const [swipes, setSwipes] = useState<string[]>()
  useEffect(() => {
    if (user)
      getSwipes(user.id).then((s) => setSwipes(s.map((swipe: any) => swipe.id)))
  }, [user])
  return swipes
}
