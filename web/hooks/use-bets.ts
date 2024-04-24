import { useEffect, useState } from 'react'
import { Bet, LimitBet } from 'common/bet'
import { useFirebaseUsersById } from './use-user'
import { uniq } from 'lodash'
import { filterDefined } from 'common/util/array'
import { db } from 'web/lib/supabase/db'
import { getBets } from 'common/supabase/bets'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useRealtimeBetsPolling } from './use-bets-supabase'

export const useUnfilledBets = (
  contractId: string,
  options?: {
    waitUntilAdvancedTrader: boolean
  }
) => {
  const [now] = useState(Date.now())

  const unfilledBets = useRealtimeBetsPolling(
    {
      contractId,
      isOpenLimitOrder: true,
      order: 'desc',
    },
    options?.waitUntilAdvancedTrader ? Infinity : 5_000,
    `unfilled-bets-${contractId}`
  )?.filter((bet) => (bet.expiresAt ? bet.expiresAt > now : true))

  return unfilledBets as LimitBet[] | undefined
}

export const useUnfilledBetsAndBalanceByUserId = (contractId: string) => {
  const unfilledBets = useUnfilledBets(contractId) ?? []
  const userIds = uniq(unfilledBets.map((b) => b.userId))
  const users = filterDefined(useFirebaseUsersById(userIds))

  const balanceByUserId = Object.fromEntries(
    users.map((user) => [user.id, user.balance])
  )
  return { unfilledBets, balanceByUserId }
}

export const useRecentBets = (contractId: string, limit: number) => {
  const [bets, setBets] = usePersistentInMemoryState<Bet[] | undefined>(
    undefined,
    `recent-bets-${contractId}-${limit}`
  )

  useEffect(() => {
    getBets(db, {
      contractId,
      limit,
      order: 'desc',
    }).then((bets) => setBets(bets.reverse()))
  }, [contractId, limit, setBets])

  return bets
}
