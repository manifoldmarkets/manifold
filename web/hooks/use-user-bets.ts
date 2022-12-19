import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { useEffect, useState } from 'react'
import {
  Bet,
  USER_BET_FILTER,
  getBetsQuery,
  listenForBets,
} from 'web/lib/firebase/bets'

export const useUserBets = (userId: string) => {
  const result = useFirestoreQueryData(
    ['bets', userId],
    getBetsQuery({ userId, ...USER_BET_FILTER })
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
      return listenForBets(setBets, {
        contractId: contractId,
        userId: userId,
      })
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
