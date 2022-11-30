import { useEffect, useState } from 'react'
import {
  Bet,
  BetFilter,
  listenForBets,
  listenForUnfilledBets,
} from 'web/lib/firebase/bets'
import { LimitBet } from 'common/bet'
import { inMemoryStore, usePersistentState } from './use-persistent-state'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'
import { useUsersById } from './use-user'
import { uniq } from 'lodash'
import { filterDefined } from 'common/util/array'

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
