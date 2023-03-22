import { useEffect, useState } from 'react'
import { Bet, listenForBets } from 'web/lib/firebase/bets'

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
