import { useEffect, useState } from 'react'
import { Bet, listenForBets } from '../lib/firebase/bets'

export const useBets = (contractId: string) => {
  const [bets, setBets] = useState<Bet[] | 'loading'>('loading')

  useEffect(() => {
    if (contractId) return listenForBets(contractId, setBets)
  }, [contractId])

  return bets
}
