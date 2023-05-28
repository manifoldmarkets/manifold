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

export const useUnfilledBetsAndBalanceByUserId = (
  contractId: string,
  filterToAnswerId?: string
) => {
  const unfilledBets = useUnfilledBets(contractId) ?? []
  const filteredBets = filterToAnswerId
    ? unfilledBets.filter((b) => b.answerId === filterToAnswerId)
    : unfilledBets

  const userIds = uniq(filteredBets.map((b) => b.userId))
  const users = filterDefined(useUsersById(userIds))

  const balanceByUserId = Object.fromEntries(
    users.map((user) => [user.id, user.balance])
  )
  return { unfilledBets: filteredBets, balanceByUserId }
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
    }).then((bets) => setBets(bets.reverse()))
  }, [contractId, limit, setBets])

  return bets
}
