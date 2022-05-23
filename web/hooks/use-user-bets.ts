import { uniq } from 'lodash'
import { useEffect, useState } from 'react'
import {
  Bet,
  listenForUserBets,
  listenForUserContractBets,
} from 'web/lib/firebase/bets'

export const useUserBets = (
  userId: string | undefined,
  options: { includeRedemptions: boolean }
) => {
  const [bets, setBets] = useState<Bet[] | undefined>(undefined)

  useEffect(() => {
    if (userId) return listenForUserBets(userId, setBets, options)
  }, [userId])

  return bets
}

export const useUserContractBets = (
  userId: string | undefined,
  contractId: string | undefined
) => {
  const [bets, setBets] = useState<Bet[] | undefined>(undefined)

  useEffect(() => {
    if (userId && contractId)
      return listenForUserContractBets(userId, contractId, setBets)
  }, [userId, contractId])

  return bets
}

export const useUserBetContracts = (
  userId: string | undefined,
  options: { includeRedemptions: boolean }
) => {
  const [contractIds, setContractIds] = useState<string[] | undefined>()

  useEffect(() => {
    if (userId) {
      const key = `user-bet-contractIds-${userId}`

      const userBetContractJson = localStorage.getItem(key)
      if (userBetContractJson) {
        setContractIds(JSON.parse(userBetContractJson))
      }

      return listenForUserBets(
        userId,
        (bets) => {
          const contractIds = uniq(bets.map((bet) => bet.contractId))
          setContractIds(contractIds)
          localStorage.setItem(key, JSON.stringify(contractIds))
        },
        options
      )
    }
  }, [userId])

  return contractIds
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
