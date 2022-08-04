import { useEffect, useState } from 'react'
import { Contract } from 'common/contract'
import {
  Bet,
  listenForBets,
  listenForRecentBets,
  listenForUnfilledBets,
  withoutAnteBets,
} from 'web/lib/firebase/bets'
import { LimitBet } from 'common/bet'

export const useBets = (
  contractId: string,
  options?: { filterChallenges: boolean; filterRedemptions: boolean }
) => {
  const [bets, setBets] = useState<Bet[] | undefined>()

  useEffect(() => {
    if (contractId)
      return listenForBets(contractId, (bets) => {
        if (options)
          setBets(
            bets.filter(
              (bet) =>
                (options.filterChallenges ? !bet.challengeSlug : true) &&
                (options.filterRedemptions ? !bet.isRedemption : true)
            )
          )
        else setBets(bets)
      })
  }, [contractId, options])

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

export const useUnfilledBets = (contractId: string) => {
  const [unfilledBets, setUnfilledBets] = useState<LimitBet[] | undefined>()
  useEffect(
    () => listenForUnfilledBets(contractId, setUnfilledBets),
    [contractId]
  )
  return unfilledBets
}
