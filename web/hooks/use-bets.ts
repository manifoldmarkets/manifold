import { useEffect, useState } from 'react'
import { Contract } from 'common/contract'
import {
  Bet,
  BetFilter,
  listenForBets,
  listenForLiveBets,
  listenForRecentBets,
  listenForUnfilledBets,
  withoutAnteBets,
} from 'web/lib/firebase/bets'
import { LimitBet } from 'common/bet'
import { getUser } from 'web/lib/firebase/users'
import { inMemoryStore, usePersistentState } from './use-persistent-state'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'

export const useBets = (contractId: string, options?: BetFilter) => {
  const [bets, setBets] = useState<Bet[] | undefined>()
  useEffectCheckEquality(() => {
    if (contractId)
      return listenForBets(
        contractId,
        (bets) => {
          setBets(bets.sort((b) => b.createdTime))
        },
        options
      )
  }, [contractId, options])

  return bets
}

export const useBetsWithoutAntes = (contract: Contract, initialBets: Bet[]) => {
  const [bets, setBets] = useState<Bet[]>(
    withoutAnteBets(contract, initialBets)
  )
  useEffect(() => {
    return listenForBets(contract.id, (bets) => {
      setBets(withoutAnteBets(contract, bets).sort((b) => b.createdTime))
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

export const useUnfilledBetsAndBalanceByUserId = (contractId: string) => {
  const [data, setData] = useState<{
    unfilledBets: LimitBet[]
    balanceByUserId: { [userId: string]: number }
  }>({ unfilledBets: [], balanceByUserId: {} })

  useEffect(() => {
    let requestCount = 0

    return listenForUnfilledBets(contractId, (unfilledBets) => {
      requestCount++
      const count = requestCount

      Promise.all(unfilledBets.map((bet) => getUser(bet.userId))).then(
        (users) => {
          if (count === requestCount) {
            const balanceByUserId = Object.fromEntries(
              users.map((user) => [user.id, user.balance])
            )
            setData({ unfilledBets, balanceByUserId })
          }
        }
      )
    })
  }, [contractId])
  return data
}

export const useLiveBets = (count: number) => {
  const [bets, setBets] = usePersistentState<Bet[] | undefined>(undefined, {
    store: inMemoryStore(),
    key: `liveBets-${count}`,
  })

  useEffect(() => {
    return listenForLiveBets(count, setBets)
  }, [count, setBets])

  return bets
}
