import { maxCachedAgeMs } from 'common/api/cache'
import { API, APIParams, APIResponse } from 'common/api/schema'
import { Bet, isOpenLimitOrder, LimitBet } from 'common/bet'
import { createLiveSnapshot } from 'common/util/live-snapshot'
import { createRequestDeduper } from 'common/util/promise'
import { User } from 'common/user'
import { groupBy, sortBy, uniq, uniqBy } from 'lodash'
import {
  Dispatch,
  SetStateAction,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react'
import {
  useApiSubscription,
  useWebsocketReconnectCount,
} from './use-api-subscription'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { useEvent } from './use-event'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useStaggeredReconnectCount } from './use-staggered-reconnect-count'

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

// Each contract has one observable snapshot for quote panels and one for
// display-only consumers. Quote reads come from the origin. Display reads go
// through the CDN, so they can lag a confirmed change by up to its max age;
// keeping the snapshots apart stops one from replacing a quote panel's. A
// confirmed cancel changes both, including when no consumer is mounted. Live
// updates are kept only while a response might not include them, so no
// tombstone TTL is needed.
const dedupeRefresh = createRequestDeduper<void>('burst')
const createOrderBook = (fresh: boolean) =>
  createLiveSnapshot<LimitBet>(
    (bets) =>
      sortBy(
        bets.filter((bet) => isOpenLimitOrder(bet)),
        'createdTime'
      ),
    fresh ? 0 : maxCachedAgeMs(API.bets.cache)
  )
const orderBooks = new Map<string, ReturnType<typeof createOrderBook>>()
const bookKey = (contractId: string, fresh: boolean) =>
  `${fresh ? 'quote' : 'display'}:${contractId}`
const getOrderBook = (contractId: string, fresh: boolean) => {
  // Never share mutable market state between SSR requests.
  if (typeof window === 'undefined') return createOrderBook(fresh)
  const key = bookKey(contractId, fresh)
  let book = orderBooks.get(key)
  if (!book) {
    book = createOrderBook(fresh)
    orderBooks.set(key, book)
  }
  return book
}
const getServerSnapshot = () => undefined

/** Apply confirmed mutations to the snapshots every consumer reads. */
export const applyLimitOrderUpdates = (bets: LimitBet[]) => {
  for (const [contractId, updates] of Object.entries(
    groupBy(bets, 'contractId')
  )) {
    // With no cached book, a later mount starts from a server read.
    for (const fresh of [true, false])
      orderBooks.get(bookKey(contractId, fresh))?.update(updates)
  }
}

export const useUnfilledBets = (
  contractId: string,
  api: (params: APIParams<'bets'>) => Promise<APIResponse<'bets'>>,
  useIsPageVisible: () => boolean,
  options?: {
    enabled?: boolean
    /** For quote panels: read from the origin, and reconcile as soon as a
     * subscription or reconnect could have missed broadcasts. Otherwise reads
     * go through the CDN and reconcile only after reconnects, staggered. */
    fresh?: boolean
  }
) => {
  const { enabled = true, fresh = false } = options ?? {}
  const book = useMemo(
    () => getOrderBook(contractId, fresh),
    [contractId, fresh]
  )
  const bets = useSyncExternalStore(
    book.subscribe,
    book.getSnapshot,
    getServerSnapshot
  )
  const isPageVisible = useIsPageVisible()
  const reconnectCount = useWebsocketReconnectCount()
  const staggeredReconnectCount = useStaggeredReconnectCount()
  const connection = fresh ? reconnectCount : staggeredReconnectCount

  const refresh = useEvent(() => {
    if (!enabled || !isPageVisible) return
    const params: APIParams<'bets'> = {
      contractId,
      kinds: 'open-limit',
      order: 'asc',
    }
    dedupeRefresh(`orders:${bookKey(contractId, fresh)}:${connection}`, () =>
      book.refresh(
        () => api(fresh ? { ...params, fresh } : params) as Promise<LimitBet[]>
      )
    ).catch((e) => console.error('Failed to load limit orders', e))
  })
  useEffect(refresh, [enabled, book, contractId, isPageVisible, connection])

  useApiSubscription({
    onSubscribed: fresh ? refresh : undefined,
    enabled,
    topics: [`contract/${contractId}/orders`],
    onBroadcast: ({ data }) => book.update(data.bets as LimitBet[]),
  })

  useEffect(() => {
    if (!enabled || !bets?.length) return
    const expiry = Math.min(...bets.map((b) => b.expiresAt ?? Infinity))
    if (!Number.isFinite(expiry)) return
    const timer = setTimeout(
      book.normalize,
      Math.min(2 ** 31 - 1, Math.max(0, expiry - Date.now()))
    )
    return () => clearTimeout(timer)
  }, [enabled, book, bets])

  return bets
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
    useUnfilledBets(contractId, api, useIsPageVisible, {
      enabled: true,
      fresh: true,
    }) ?? []
  const userIds = uniq(unfilledBets.map((b) => b.userId))
  const balanceByUserId = useUserBalances(
    contractId,
    userIds,
    usersApi,
    useIsPageVisible
  )
  return { unfilledBets, balanceByUserId }
}

type MakerBalance = { id: string; balance: number }
const balancesByContract = new Map<
  string,
  ReturnType<typeof createLiveSnapshot<MakerBalance>>
>()
const getBalances = (contractId: string) => {
  if (typeof window === 'undefined') return createLiveSnapshot<MakerBalance>()
  let store = balancesByContract.get(contractId)
  if (!store) {
    store = createLiveSnapshot<MakerBalance>()
    balancesByContract.set(contractId, store)
  }
  return store
}

const useUserBalances = (
  contractId: string,
  userIds: string[],
  api: (
    params: APIParams<'users/by-id/balance'>
  ) => Promise<APIResponse<'users/by-id/balance'>>,
  useIsPageVisible: () => boolean
) => {
  const store = useMemo(() => getBalances(contractId), [contractId])
  const users = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    getServerSnapshot
  )
  const isPageVisible = useIsPageVisible()
  const reconnectCount = useWebsocketReconnectCount()
  const ids = [...userIds].sort()
  const idsKey = ids.join(',')
  const refresh = useEvent(() => {
    if (!isPageVisible || !ids.length) return
    dedupeRefresh(`balances:${contractId}:${idsKey}:${reconnectCount}`, () =>
      store.refresh(async () => {
        const users = await api({ ids, fresh: true })
        const byId = new Map(users.map((user) => [user.id, user.balance]))
        // Missing/deleted users cannot fund a fill. Retry them on the next
        // mount, refocus, reconnect, or maker-set change, like every other id.
        return ids.map((id) => ({ id, balance: byId.get(id) ?? 0 }))
      })
    ).catch((e) => console.error('Failed to load maker balances', e))
  })
  // Preserve known balances while revalidating. "Known" does not mean fresh:
  // subscriptions stop while hidden and when a maker leaves the book.
  useEffect(refresh, [store, contractId, idsKey, isPageVisible, reconnectCount])
  useApiSubscription({
    topics: ids.map((id) => `user/${id}`),
    enabled: ids.length > 0 && isPageVisible,
    onSubscribed: refresh,
    onBroadcast: ({ data }) => {
      const { id, balance } = (data.user ?? {}) as Partial<User>
      if (id !== undefined && balance !== undefined && ids.includes(id))
        store.update([{ id, balance }])
    },
  })
  return useMemo(() => {
    const byId = new Map(users?.map((user) => [user.id, user.balance]))
    // computeFills interprets undefined as unlimited. Until a maker's balance
    // arrives, omit its liquidity from the quote rather than inventing funding.
    return Object.fromEntries(userIds.map((id) => [id, byId.get(id) ?? 0]))
  }, [users, idsKey])
}
