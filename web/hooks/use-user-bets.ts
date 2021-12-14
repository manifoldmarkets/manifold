import { useEffect, useState } from 'react'
import { Bet, listenForUserBets } from '../lib/firebase/bets'

export const useUserBets = (userId: string) => {
  const [bets, setBets] = useState<Bet[] | 'loading'>('loading')

  useEffect(() => {
    return listenForUserBets(userId, setBets)
  }, [userId])

  return bets
}
