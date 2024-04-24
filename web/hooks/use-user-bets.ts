import { useEffect } from 'react'
import { Bet, listenForBets } from 'web/lib/firebase/bets'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

export const useUserContractBets = (
  userId: string | undefined,
  contractId: string | undefined
) => {
  const [bets, setBets] = usePersistentInMemoryState<Bet[] | undefined>(
    undefined,
    `bets-${userId}-${contractId}`
  )

  useEffect(() => {
    if (userId && contractId)
      return listenForBets(setBets, {
        contractId: contractId,
        userId: userId,
      })
  }, [userId, contractId])

  return bets
}
