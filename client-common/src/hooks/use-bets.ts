import { maxCachedAgeMs } from 'common/api/cache'
import { API, APIParams, APIResponse } from 'common/api/schema'
import { Bet, isOpenLimitOrder, LimitBet } from 'common/bet'
import { createLiveSnapshot } from 'common/util/live-snapshot'
import { User } from 'common/user'
import { groupBy, sortBy, uniq, uniqBy } from 'lodash'
import {
  Dispatch,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
import { useApiSubscription } from './use-api-subscription'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { useEvent } from './use-event'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

export function useBetsOnce(
  api: (params: APIParams<'bets'>) => Promise<APIResponse<'bets'>>,
  options: APIParams<'bets'>
) {
  const [bets, setBets] = usePersistentInMemoryState<Bet[] | undefined>(
    undefined,
    `use-bets-${JSON.stringify(options)}`
  )

  // Only the latest request counts, so one for earlier options landing late
  // can't replace its results.
  const latestRequest = useRef(0)
  useEffectCheckEquality(() => {
    const requestId = ++latestRequest.current
    api(options ?? {}).then((bets) => {
      if (requestId === latestRequest.current) setBets(bets)
    })
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
// tombstone TTL is needed. Updates from before a time with no consumers are
// replayed only if they closed an order: anything else may have changed
// unseen.
const createOrderBook = (fresh: boolean) =>
  createLiveSnapshot<LimitBet>(
    (bets) =>
      sortBy(
        bets.filter((bet) => isOpenLimitOrder(bet)),
        'createdTime'
      ),
    fresh ? 0 : maxCachedAgeMs(API.bets.cache),
    // Filled, cancelled and expired orders can't reopen.
    (bet) => !isOpenLimitOrder(bet)
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
    /** Quote panels bypass the CDN; display consumers keep endpoint caching. */
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

  const refresh = useEvent(() => {
    if (!enabled || !isPageVisible) return
    const params: APIParams<'bets'> = {
      contractId,
      kinds: 'open-limit',
      order: 'asc',
    }
    book
      .refresh(
        () => api(fresh ? { ...params, fresh } : params) as Promise<LimitBet[]>
      )
      .catch((e) => console.error('Failed to load limit orders', e))
  })
  // Held while subscribed to the book's updates, below.
  useEffect(() => (enabled ? book.hold() : undefined), [book, enabled])
  useEffect(refresh, [enabled, book, contractId, isPageVisible])

  useApiSubscription({
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
  const balances = useUserBalances(userIds, usersApi, useIsPageVisible) ?? []

  const balanceByUserId = Object.fromEntries(
    balances.map(({ id, balance }) => [id, balance])
  )
  return { unfilledBets, balanceByUserId }
}

const useUserBalances = (
  userIds: string[],
  api: (
    params: APIParams<'users/by-id/balance'>
  ) => Promise<APIResponse<'users/by-id/balance'>>,
  useIsPageVisible: () => boolean
) => {
  const [users, setUsers] = usePersistentInMemoryState<
    { id: string; balance: number }[]
  >([], `user-balances-${userIds.join('-')}`)
  const isPageVisible = useIsPageVisible()

  // Load initial data
  useEffect(() => {
    if (!userIds.length || !isPageVisible) return
    api({ ids: userIds }).then((users) => {
      setUsers(users)
    })
  }, [userIds.join(','), isPageVisible])

  // Subscribe to updates
  useApiSubscription({
    topics: userIds.map((id) => `user/${id}`),
    onBroadcast: ({ data }) => {
      const { user } = data as { user: Partial<User> }
      if (!user) return
      const prevUser = users.find((u) => u.id === user.id)
      if (!prevUser) return
      setUsers((prevUsers) => {
        return prevUsers.map((prevU) =>
          prevU.id === user.id ? { ...prevU, ...user } : prevU
        )
      })
    },
    enabled: userIds.length > 0 && isPageVisible,
  })

  return users
}
