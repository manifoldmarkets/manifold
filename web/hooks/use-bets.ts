import { useEffect } from 'react'
import { uniq, uniqBy, sortBy } from 'lodash'

import { Bet, LimitBet } from 'common/bet'
import { usePollUserBalances } from './use-user'
import { db } from 'web/lib/supabase/db'
import { getBets } from 'common/supabase/bets'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useApiSubscription } from './use-api-subscription'

export const useUnfilledBets = (
  contractId: string,
  options?: {
    enabled?: boolean
  }
) => {
  const { enabled = true } = options ?? {}

  const [bets, setBets] = usePersistentInMemoryState<LimitBet[] | undefined>(
    undefined,
    `unfilled-bets-${contractId}`
  )

  const addBets = (newBets: LimitBet[]) => {
    setBets((bets) => {
      return sortBy(
        uniqBy([...newBets, ...(bets ?? [])], 'id'),
        'createdTime'
      ).filter(
        (bet) =>
          !bet.isFilled &&
          !bet.isCancelled &&
          (!bet.expiresAt || bet.expiresAt > Date.now())
      )
    })
  }

  useEffect(() => {
    if (enabled)
      getBets(db, { contractId, isOpenLimitOrder: true }).then((bets) =>
        addBets(bets as LimitBet[])
      )
  }, [enabled, contractId])

  useApiSubscription({
    enabled,
    topics: [`contract/${contractId}/orders`],
    onBroadcast: ({ data }) => {
      addBets(data.bets as LimitBet[])
    },
  })

  return bets
}

export const useUnfilledBetsAndBalanceByUserId = (contractId: string) => {
  const unfilledBets = useUnfilledBets(contractId) ?? []
  const userIds = uniq(unfilledBets.map((b) => b.userId))
  const balances = usePollUserBalances(userIds) ?? []

  const balanceByUserId = Object.fromEntries(
    balances.map(({ id, balance }) => [id, balance])
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
