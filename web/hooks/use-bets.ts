import { useEffect, useState } from 'react'
import { Contract } from '../../common/contract'
import {
  Bet,
  getRecentBets,
  listenForBets,
  listenForRecentBets,
  withoutAnteBets,
} from '../lib/firebase/bets'

export const useBets = (contractId: string) => {
  const [bets, setBets] = useState<Bet[] | undefined>()

  useEffect(() => {
    if (contractId) return listenForBets(contractId, setBets)
  }, [contractId])

  return bets
}

export const useBetsWithoutAntes = (contract: Contract, initialBets: Bet[]) => {
  const [bets, setBets] = useState<Bet[]>(
    withoutAnteBets(contract, initialBets)
  )

  useEffect(() => {
    return listenForBets(contract.id, (bets) => {
      setBets(withoutAnteBets(contract, bets))
    })
  }, [contract])

  return bets
}

export const useRecentBets = () => {
  const [recentBets, setRecentBets] = useState<Bet[] | undefined>()
  useEffect(() => listenForRecentBets(setRecentBets), [])
  return recentBets
}

export const useGetRecentBets = () => {
  const [recentBets, setRecentBets] = useState<Bet[] | undefined>()
  useEffect(() => {
    getRecentBets().then(setRecentBets)
  }, [])
  return recentBets
}
