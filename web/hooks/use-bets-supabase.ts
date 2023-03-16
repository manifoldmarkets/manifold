import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { useEffect, useState } from 'react'
import { getBets, getTotalBetCount } from 'web/lib/supabase/bets'
import { getContractFromSlug } from 'web/lib/supabase/contracts'
import { CONTRACT_BET_FILTER } from 'web/pages/[username]/[contractSlug]'

export function useBets(contractId: string, limit: number) {
  const [bets, setBets] = useState<Bet[]>([])

  useEffect(() => {
    if (contractId) {
      getBets({
        contractId,
        ...CONTRACT_BET_FILTER,
        limit,
        order: 'desc',
      }).then((result) => setBets(result))
    }
  }, [contractId])

  return bets
}

export function useBetCount(contractId: string) {
  const [betCount, setBetCount] = useState<number>(0)

  useEffect(() => {
    if (contractId) {
      getTotalBetCount(contractId).then((result) => setBetCount(result))
    }
  }, [contractId])

  return betCount
}
