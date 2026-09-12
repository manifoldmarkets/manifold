import { APIParams, APIResponse } from 'common/api/schema'
import { Bet, isOpenLimitOrder, LimitBet } from 'common/bet'
import { User } from 'common/user'
import { groupBy, sortBy, uniq, uniqBy } from 'lodash'
import { Dispatch, SetStateAction, useEffect, useMemo } from 'react'
import {
  useApiSubscription,
  useWebsocketReconnectCount,
} from './use-api-subscription'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { useEvent } from './use-event'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { createRequestDeduper } from 'common/util/promise'

export function useBetsOnce(
  api: (params: APIParams<'bets'>) => Promise<APIResponse<'bets'>>,
  options: APIParams<'bets'>
) {
  const [bets, setBets] = usePersistentInMemoryState<Bet[] | undefined>(
    undefined,
    `use-bets-${JSON.stringify(options)}`
  )

  useEffectCheckEquality(() => {
    api(options ?? {}).then((bets) => setBets(bets))
  }, [options])

  return bets
}

export const useContractBets = (
  contractId: string,
  opts: APIParams<'bets'> & { enabled?: boolean },
  useIsPageVisible: () => boolean,
  api: (params: APIParams<'bets'>) => Promise<APIResponse<'bets'>>
) => {
  const { enabled = true, ...apiOptions } = {
    contractId,
    ...opts,
  }
  const optionsKey = JSON.stringify(apiOptions)

  const [newBets, setNewBets] = usePersistentInMemoryState<Bet[]>(
    [],
    `${optionsKey}-bets`
  )

  const addBets = (bets: Bet[]) => {
    setNewBets((currentBets) => {
      const uniqueBets = sortBy(
        uniqBy([...currentBets, ...bets], 'id'),
        'createdTime'
      )
      return uniqueBets.filter((b) => !betShouldBeFiltered(b, apiOptions))
    })
  }

  const isPageVisible = useIsPageVisible()

  useEffect(() => {
    if (isPageVisible && enabled) {
      api(apiOptions).then(addBets)
    }
  }, [optionsKey, enabled, isPageVisible])

  useApiSubscription({
    topics: [`contract/${contractId}/new-bet`],
    onBroadcast: (msg) => {
      addBets(msg.data.bets as Bet[])
    },
    enabled,
  })

  listenToOrderUpdates(contractId, setNewBets, enabled)

  return newBets
}

export const listenToOrderUpdates = (
  contractId: string,
  setNewBets: Dispatch<SetStateAction<Bet[]>>,
  enabled: boolean
) => {
  useApiSubscription({
    topics: [`contract/${contractId}/orders`],
    onBroadcast: (msg) => {
      const betUpdates = msg.data.bets as LimitBet[]
      setNewBets((currentBets) =>
        currentBets.map(
          (bet) =>
            betUpdates.find((updatedBet) => updatedBet.id === bet.id) ?? bet
        )
      )
    },
    enabled,
  })
}
export const listenToUserOrders = (
  userId: string,
  setNewBets: Dispatch<SetStateAction<LimitBet[]>>,
  enabled: boolean
) => {
  useApiSubscription({
    topics: [`user/${userId}/orders`],
    onBroadcast: (msg) => {
      const betUpdates = msg.data.bets as LimitBet[]
      console.log('betUpdates', betUpdates)
      setNewBets((currentBets) => {
        const currentBetsMap = new Map(currentBets.map((bet) => [bet.id, bet]))
        betUpdates.forEach((updatedBet) => {
          currentBetsMap.set(updatedBet.id, updatedBet)
        })
        return Array.from(currentBetsMap.values())
      })
    },
    enabled,
  })
}

export function betShouldBeFiltered(bet: Bet, options?: APIParams<'bets'>) {
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
    (options.beforeTime !== undefined &&
      bet.createdTime >= options.beforeTime) ||
    // if redemption filter is true, and bet is redemption
    (options.filterRedemptions && bet.isRedemption) ||
    // if open-limit kind exists, and bet is not filled/cancelled
    (options.kinds === 'open-limit' && (bet.isFilled || bet.isCancelled)) ||
    // if commentRepliesOnly is true, and bet is not a comment reply
    (options.commentRepliesOnly && !bet.replyToCommentId) ||
    // if minAmount exists, and bet amount is below the minimum
    (options.minAmount !== undefined &&
      Math.abs(bet.amount) < options.minAmount) ||
    // if excludeApi is true, and bet was made via API
    (options.excludeApi && bet.isApi)

  return shouldBeFiltered
}

export const useSubscribeGlobalBets = (options?: APIParams<'bets'>) => {
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
      return uniqueBets.filter((b) => !betShouldBeFiltered(b, options))
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

// Filling and cancelling a limit order are both terminal, so once we've seen an
// order close we can keep it out of every order book we hold, even if a request
// that was already in flight comes back still reporting it as open.
const CLOSED_ORDER_MEMORY_MS = 30 * 60 * 1000
const CLOSED_ORDER_PRUNE_SIZE = 500
const closedOrderTimes = new Map<string, number>()

const rememberClosedOrders = (bets: LimitBet[], now: number) => {
  for (const bet of bets) {
    if (!isOpenLimitOrder(bet, now)) closedOrderTimes.set(bet.id, now)
  }
  if (closedOrderTimes.size <= CLOSED_ORDER_PRUNE_SIZE) return
  for (const [id, closedAt] of closedOrderTimes) {
    if (closedAt < now - CLOSED_ORDER_MEMORY_MS) closedOrderTimes.delete(id)
  }
}

const openOrdersOnly = (bets: LimitBet[]) => {
  const now = Date.now()
  return bets.filter(
    (bet) => isOpenLimitOrder(bet, now) && !closedOrderTimes.has(bet.id)
  )
}

type LimitOrderListener = (bets: LimitBet[]) => void
const unfilledBetListeners = new Map<string, Set<LimitOrderListener>>()

/** Push limit order updates straight into every mounted `useUnfilledBets`,
 * without waiting for the websocket to echo them back. Cancel an order and the
 * order book the bet and sell panels price against drops it immediately, so
 * they stop quoting a counterparty that has gone. */
export const applyLimitOrderUpdates = (bets: LimitBet[]) => {
  if (bets.length === 0) return
  rememberClosedOrders(bets, Date.now())
  for (const [contractId, contractBets] of Object.entries(
    groupBy(bets, 'contractId')
  )) {
    for (const listener of unfilledBetListeners.get(contractId) ?? []) {
      listener(contractBets)
    }
  }
}

// Every panel on a market page mounts its own useUnfilledBets, and they all
// want the same request at the same moment — on load, on tab refocus, on
// reconnect. One request between them rather than N identical ones.
const dedupeUnfilledBetsFetch = createRequestDeduper<LimitBet[]>()

const fetchUnfilledBets = (
  contractId: string,
  triggerKey: string,
  api: (params: APIParams<'bets'>) => Promise<APIResponse<'bets'>>
) =>
  // The trigger is part of the key so a reconnect mid-request doesn't get
  // handed the snapshot taken before the socket dropped.
  dedupeUnfilledBetsFetch(`${contractId}|${triggerKey}`, () =>
    api({ contractId, kinds: 'open-limit', order: 'asc' }).then(
      (bets) => bets as LimitBet[]
    )
  )

export const useUnfilledBets = (
  contractId: string,
  api: (params: APIParams<'bets'>) => Promise<APIResponse<'bets'>>,
  useIsPageVisible: () => boolean,
  options?: {
    enabled?: boolean
  }
) => {
  const { enabled = true } = options ?? {}

  const [bets, setBets] = usePersistentInMemoryState<LimitBet[] | undefined>(
    undefined,
    `unfilled-bets-${contractId}`
  )

  const addBets = useEvent((newBets: LimitBet[]) => {
    rememberClosedOrders(newBets, Date.now())
    setBets((bets) =>
      openOrdersOnly(
        sortBy(uniqBy([...newBets, ...(bets ?? [])], 'id'), 'createdTime')
      )
    )
  })

  const isPageVisible = useIsPageVisible()
  // Resubscribing after an outage doesn't replay the order updates we missed
  // while the socket was down, so reconcile whenever it comes back.
  const reconnectCount = useWebsocketReconnectCount()

  useEffect(() => {
    // Skip while the tab is hidden — we refetch on the way back. Matches
    // useContractBets, and stops a backgrounded tab firing a request when it
    // loses focus.
    if (!enabled || !isPageVisible) return
    fetchUnfilledBets(contractId, `${reconnectCount}`, api)
      // Reset bets instead of adding to existing, since we want to exclude those recently filled/cancelled.
      .then((bets) => setBets(openOrdersOnly(bets)))
      .catch((e) => console.error('Failed to load limit orders', e))
  }, [enabled, contractId, isPageVisible, reconnectCount])

  // Local updates (e.g. you cancelling one of your own orders) reach every
  // other panel on the page through here rather than over the network.
  useEffect(() => {
    if (!enabled) return
    const listeners =
      unfilledBetListeners.get(contractId) ?? new Set<LimitOrderListener>()
    unfilledBetListeners.set(contractId, listeners)
    listeners.add(addBets)
    return () => {
      listeners.delete(addBets)
      if (listeners.size === 0) unfilledBetListeners.delete(contractId)
    }
  }, [enabled, contractId, addBets])

  useApiSubscription({
    enabled,
    topics: [`contract/${contractId}/orders`],
    onBroadcast: ({ data }) => {
      addBets(data.bets as LimitBet[])
    },
  })

  // A panel that mounts after a cancel starts from the in-memory cache, which
  // can still be holding the order that was just cancelled.
  return useMemo(() => bets && openOrdersOnly(bets), [bets])
}

export const useUnfilledBetsAndBalanceByUserId = (
  contractId: string,
  api: (params: APIParams<'bets'>) => Promise<APIResponse<'bets'>>,
  usersApi: (
    params: APIParams<'users/by-id/balance'>
  ) => Promise<APIResponse<'users/by-id/balance'>>,
  useIsPageVisible: () => boolean
) => {
  const unfilledBets =
    useUnfilledBets(contractId, api, useIsPageVisible, { enabled: true }) ?? []
  const userIds = uniq(unfilledBets.map((b) => b.userId))
  const balanceByUserId = useUserBalances(
    contractId,
    userIds,
    usersApi,
    useIsPageVisible
  )

  return { unfilledBets, balanceByUserId }
}

const useUserBalances = (
  cacheKey: string,
  userIds: string[],
  api: (
    params: APIParams<'users/by-id/balance'>
  ) => Promise<APIResponse<'users/by-id/balance'>>,
  useIsPageVisible: () => boolean
) => {
  // Keyed by the contract rather than by the set of makers. Keying by the set
  // minted a new cache entry every time anyone posted an order, and — because
  // a changed key resets the state to its initial value — briefly emptied the
  // balances. An unknown balance counts as unlimited in computeFills, so for
  // the length of the refetch every maker looked fully funded.
  const [balances, setBalances] = usePersistentInMemoryState<
    Record<string, number>
  >({}, `user-balances-${cacheKey}`)
  const isPageVisible = useIsPageVisible()
  const reconnectCount = useWebsocketReconnectCount()

  const fetchBalances = useEvent(async (ids: string[]) => {
    if (!ids.length) return
    try {
      const users = await api({ ids })
      setBalances((prev) => ({
        ...prev,
        ...Object.fromEntries(users.map(({ id, balance }) => [id, balance])),
      }))
    } catch (e) {
      console.error('Failed to load maker balances', e)
    }
  })

  // Ask only for makers we haven't seen. The subscriptions below keep the ones
  // we hold current, so a new order from a new account no longer refetches the
  // balance of every other maker in the book.
  const missingIds = userIds.filter((id) => balances[id] === undefined)
  const missingKey = missingIds.join(',')

  useEffect(() => {
    if (!isPageVisible) return
    fetchBalances(missingIds)
  }, [missingKey, isPageVisible])

  // Balances can have moved while the socket was down, and those updates
  // aren't replayed.
  useEffect(() => {
    if (!isPageVisible || !reconnectCount) return
    fetchBalances(userIds)
  }, [reconnectCount])

  useApiSubscription({
    topics: userIds.map((id) => `user/${id}`),
    onBroadcast: ({ data }) => {
      const { user } = data as { user: Partial<User> }
      const { id, balance } = user ?? {}
      if (id === undefined || balance === undefined) return
      setBalances((prev) =>
        // Only track balances we actually asked for.
        prev[id] === undefined ? prev : { ...prev, [id]: balance }
      )
    },
    enabled: userIds.length > 0 && isPageVisible,
  })

  return balances
}
