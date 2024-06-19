import { maxBy, orderBy, uniq, uniqBy, sortBy } from 'lodash'
import { useEffect } from 'react'

import { Bet, BetFilter, LimitBet } from 'common/bet'
import { db } from 'web/lib/supabase/db'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { applyBetsFilter, convertBet } from 'common/supabase/bets'
import { Row } from 'common/supabase/utils'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { usePersistentSupabasePolling } from 'web/hooks/use-persistent-supabase-polling'
import { useApiSubscription } from './use-api-subscription'
import { usePollUserBalances } from './use-user'
import { api } from 'web/lib/firebase/api'
import { APIParams } from 'common/api/schema'
import { useIsPageVisible } from './use-page-visible'

export function betShouldBeFiltered(bet: Bet, options?: BetFilter) {
  if (!options) {
    return false
  }
  const shouldBeFiltered =
    // if contract filter exists, and bet doesn't match contract
    (options.contractId && bet.contractId != options.contractId) ||
    // if user filter exists, and bet doesn't match user
    (options.userId && bet.userId != options.userId) ||
    // if afterTime filter exists, and bet is before that time
    (options.afterTime && bet.createdTime <= options.afterTime) ||
    // if beforeTime filter exists, and bet is after that time
    (options.beforeTime && bet.createdTime >= options.beforeTime) ||
    // if challenges filter is true, and bet is a challenge
    (options.filterChallenges && bet.isChallenge) ||
    // if ante filter is true, and bet is ante
    (options.filterAntes && bet.isAnte) ||
    // if redemption filter is true, and bet is redemption
    (options.filterRedemptions && bet.isRedemption) ||
    // if isOpenlimitOrder filter exists, and bet is not filled/cancelled
    (options.isOpenLimitOrder && (bet.isFilled || bet.isCancelled))
  return shouldBeFiltered
}

export function useBets(options?: APIParams<'bets'>) {
  const [bets, setBets] = usePersistentInMemoryState<Bet[] | undefined>(
    undefined,
    `use-bets-${JSON.stringify(options)}`
  )

  useEffectCheckEquality(() => {
    api('bets', options ?? {}).then((bets) => setBets(bets))
  }, [options])

  return bets
}

export function useRealtimeBetsPolling(
  options: Omit<BetFilter, 'isOpenLimitOrder'>,
  ms: number,
  key: string
) {
  let allRowsQ = db.from('contract_bets').select('*')
  allRowsQ = allRowsQ.order('created_time', {
    ascending: options?.order === 'asc',
  })
  allRowsQ = applyBetsFilter(allRowsQ, options)

  const newRowsOnlyQ = (rows: Row<'contract_bets'>[] | undefined) => {
    // You can't use allRowsQ here because it keeps tacking on another gt clause
    const { afterTime, ...rest } = options
    const latestCreatedTime = maxBy(rows, 'created_time')?.created_time
    let q = db
      .from('contract_bets')
      .select('*')
      .gt(
        'created_time',
        latestCreatedTime ?? new Date(afterTime ?? 0).toISOString()
      )
    q = applyBetsFilter(q, rest)
    return q
  }

  const results = usePersistentSupabasePolling(
    'contract_bets',
    allRowsQ,
    newRowsOnlyQ,
    key,
    {
      ms,
      deps: [options.contractId, ms],
      shouldUseLocalStorage: false,
    }
  )
  return results
    ? orderBy(results.map(convertBet), 'createdTime', 'desc')
    : undefined
}

export const useSubscribeNewBets = (
  contractId: string,
  params?: { afterTime?: number; includeRedemptions?: boolean }
) => {
  const { afterTime = Date.now(), includeRedemptions = false } = params ?? {}

  const [newBets, setNewBets] = usePersistentInMemoryState<Bet[]>(
    [],
    `${contractId}-new-bets`
  )

  const addBets = (bets: Bet[]) => {
    setNewBets((currentBets) => {
      const uniqueBets = sortBy(
        uniqBy([...currentBets, ...bets], 'id'),
        'createdTime'
      )
      return uniqueBets.filter(
        (b) =>
          b.createdTime > afterTime && (includeRedemptions || !b.isRedemption)
      )
    })
  }

  const isPageVisible = useIsPageVisible()

  useEffect(() => {
    if (isPageVisible) {
      api('bets', {
        contractId,
        afterTime,
        filterRedemptions: !includeRedemptions,
      }).then(addBets)
    }
  }, [contractId, afterTime, isPageVisible])

  useApiSubscription({
    topics: [`contract/${contractId}/new-bet`],
    onBroadcast: (msg) => {
      addBets(msg.data.bets as Bet[])
    },
  })

  return newBets
}

export const useSubscribeGlobalBets = (params?: {
  includeRedemptions?: boolean
}) => {
  const { includeRedemptions = false } = params ?? {}

  const [newBets, setNewBets] = usePersistentInMemoryState<Bet[]>(
    [],
    'global-new-bets'
  )

  const addBets = (bets: Bet[]) => {
    setNewBets((currentBets) => {
      const uniqueBets = sortBy(
        uniqBy([...currentBets, ...bets], 'id'),
        'createdTime'
      )
      return uniqueBets.filter((b) => includeRedemptions || !b.isRedemption)
    })
  }

  useApiSubscription({
    topics: [`global/new-bet`],
    onBroadcast: (msg) => {
      addBets(msg.data.bets as Bet[])
    },
  })

  return newBets
}

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

  const isPageVisible = useIsPageVisible()

  useEffect(() => {
    if (enabled)
      api('bets', { contractId, kinds: 'open-limit' }).then((bets) =>
        addBets(bets as LimitBet[])
      )
  }, [enabled, contractId, isPageVisible])

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
