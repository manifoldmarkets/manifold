import { useEffect, useState } from 'react'
import { Bet, listenForUserBets } from '../lib/firebase/bets'

export const useUserBets = (userId: string | undefined) => {
  const [bets, setBets] = useState<Bet[] | undefined>(undefined)

  useEffect(() => {
    if (userId) return listenForUserBets(userId, setBets)
  }, [userId])

  return bets
}
