import { useEffect, useState } from 'react'
import {
  Bet,
  listenForBets,
  listenForUnfilledBets,
} from 'web/lib/firebase/bets'
import { BetFilter, LimitBet } from 'common/bet'
import { inMemoryStore, usePersistentState } from './use-persistent-state'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'
import { useUsersById } from './use-user'
import { uniq } from 'lodash'
import { filterDefined } from 'common/util/array'
import { db } from 'web/lib/supabase/db'
import { getBets } from 'common/supabase/bets'

export const useBets = (options?: BetFilter) => {
  const [bets, setBets] = useState<Bet[] | undefined>()
  useEffectCheckEquality(() => {
    return listenForBets(setBets, options)
  }, [options])

  return bets
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
  const unfilledBets = useUnfilledBets(contractId) ?? []

  const userIds = uniq(unfilledBets.map((b) => b.userId))
  const users = filterDefined(useUsersById(userIds))

  const balanceByUserId = Object.fromEntries(
    users.map((user) => [user.id, user.balance])
  )
  return { unfilledBets, balanceByUserId }
}

export const useLiveBets = (count: number, options?: BetFilter) => {
  const [bets, setBets] = usePersistentState<Bet[] | undefined>(undefined, {
    store: inMemoryStore(),
    key: `liveBets-${count}`,
  })
  useEffectCheckEquality(() => {
    return listenForBets(setBets, { limit: count, order: 'desc', ...options })
  }, [count, setBets, options])

  return bets
}

export const useOpenLimitBets = (userId: string) => {
  const openLimitBets = useBets({
    userId: userId,
    isOpenLimitOrder: true,
    limit: 1000,
  }) as LimitBet[] | undefined
  const [savedBets, setSavedBets] = usePersistentState<LimitBet[] | undefined>(
    undefined,
    {
      key: `open-limit-bets-${userId}`,
      store: inMemoryStore(),
    }
  )

  useEffect(() => {
    if (openLimitBets) {
      setSavedBets(openLimitBets)
    }
  }, [openLimitBets, setSavedBets])

  return openLimitBets ?? savedBets
}

export const useRecentBets = (contractId: string, limit: number) => {
  const [bets, setBets] = usePersistentState<Bet[] | undefined>(undefined, {
    key: `recent-bets-${contractId}-${limit}`,
    store: inMemoryStore(),
  })

  useEffect(() => {
    getBets(db, {
      contractId,
      limit,
      order: 'desc',
    }).then((bets: Bet[]) => setBets(bets.reverse()))
  }, [contractId, limit, setBets])

  return bets
}
