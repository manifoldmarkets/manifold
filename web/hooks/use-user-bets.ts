import _ from 'lodash'
import { useEffect, useState } from 'react'
import { Bet, listenForUserBets } from '../lib/firebase/bets'

export const useUserBets = (userId: string | undefined) => {
  const [bets, setBets] = useState<Bet[] | undefined>(undefined)

  useEffect(() => {
    if (userId) return listenForUserBets(userId, setBets)
  }, [userId])

  return bets
}

export const useUserBetContracts = (userId: string | undefined) => {
  const [contractIds, setContractIds] = useState<string[] | undefined>()

  useEffect(() => {
    if (userId) {
      const key = `user-bet-contractIds-${userId}`

      const userBetContractJson = localStorage.getItem(key)
      if (userBetContractJson) {
        setContractIds(JSON.parse(userBetContractJson))
      }

      return listenForUserBets(userId, (bets) => {
        const contractIds = _.uniq(bets.map((bet) => bet.contractId))
        setContractIds(contractIds)
        localStorage.setItem(key, JSON.stringify(contractIds))
      })
    }
  }, [userId])

  return contractIds
}
