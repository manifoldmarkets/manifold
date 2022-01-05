import _ from 'lodash'
import { useEffect, useState } from 'react'
import { Bet, listenForRecentBets } from '../lib/firebase/bets'
import {
  computeHotContracts,
  Contract,
  listenForContracts,
} from '../lib/firebase/contracts'

export const useContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | 'loading'>('loading')

  useEffect(() => {
    return listenForContracts(setContracts)
  }, [])

  return contracts
}

export const useHotContracts = () => {
  const [recentBets, setRecentBets] = useState<Bet[] | 'loading'>('loading')

  useEffect(() => {
    const oneDay = 1000 * 60 * 60 * 24
    return listenForRecentBets(oneDay, setRecentBets)
  }, [])

  if (recentBets === 'loading') return 'loading'

  return computeHotContracts(recentBets)
}
