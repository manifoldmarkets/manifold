import { APIParams, APIResponse } from 'common/api/schema'
import { Bet, LimitBet } from 'common/bet'
import { User } from 'common/user'
import { sortBy, uniq, uniqBy } from 'lodash'
import { Dispatch, SetStateAction, useEffect, useRef } from 'react'
import { useApiSubscription } from './use-api-subscription'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { RecoverySnapshot } from 'common/api/subscription-recovery'
import { unauthedApi } from 'common/util/api'

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
  const requestGeneration = useRef(0)

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
      const request = ++requestGeneration.current
      api(apiOptions).then((bets) => {
        if (request === requestGeneration.current) addBets(bets)
      })
    }
    return () => {
      requestGeneration.current++
    }
  }, [optionsKey, enabled, isPageVisible])

  useApiSubscription({
    topics: [`contract/${contractId}/new-bet`, `contract/${contractId}/orders`],
    recoveryKey: optionsKey,
    getSnapshot: async (signal) => {
      const request = ++requestGeneration.current
      const bets = await unauthedApi(
        'bets',
        { ...apiOptions },
        { cache: 'no-store', signal }
      )
      return () => {
        if (request !== requestGeneration.current) return false
        setNewBets(sortBy(bets, 'createdTime'))
      }
    },
    onBroadcast: (msg) => {
      requestGeneration.current++
      if (msg.topic.endsWith('/orders')) {
        const updates = msg.data.bets as LimitBet[]
        setNewBets((bets) =>
          bets.map(
            (bet) => updates.find((update) => update.id === bet.id) ?? bet
          )
        )
        return
      }
      addBets(msg.data.bets as Bet[])
    },
    enabled,
  })

  return newBets
}

export const listenToOrderUpdates = (
  contractId: string,
  setNewBets: Dispatch<SetStateAction<Bet[]>>,
  enabled: boolean,
  getSnapshot: RecoverySnapshot,
  recoveryKey?: string
) => {
  useApiSubscription({
    topics: [`contract/${contractId}/orders`],
    getSnapshot,
    recoveryKey,
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
  enabled: boolean,
  getSnapshot: RecoverySnapshot,
  recoveryKey?: string
) => {
  useApiSubscription({
    topics: [`user/${userId}/orders`],
    getSnapshot,
    recoveryKey,
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
    recoveryKey: JSON.stringify(options),
    getSnapshot: async (signal) => {
      const bets = await unauthedApi(
        'bets',
        { ...options },
        { cache: 'no-store', signal }
      )
      return () => setNewBets(sortBy(bets, 'createdTime'))
    },
    onBroadcast: (msg) => {
      addBets(msg.data.bets as Bet[])
    },
  })

  return newBets
}

export const useUnfilledBets = (
  contractId: string,
  api: (params: APIParams<'bets'>) => Promise<APIResponse<'bets'>>,
  useIsPageVisible: () => boolean,
  options?: {
    enabled?: boolean
  }
) => {
  const { enabled = true } = options ?? {}
  const requestGeneration = useRef(0)

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
    const request = ++requestGeneration.current
    if (enabled)
      api({ contractId, kinds: 'open-limit', order: 'asc' }).then(
        // Reset bets instead of adding to existing, since we want to exclude those recently filled/cancelled.
        (bets) => {
          if (request === requestGeneration.current) setBets(bets as LimitBet[])
        }
      )
    return () => {
      requestGeneration.current++
    }
  }, [enabled, contractId, isPageVisible])

  useApiSubscription({
    enabled,
    topics: [`contract/${contractId}/orders`],
    getSnapshot: async (signal) => {
      const request = ++requestGeneration.current
      const bets = await unauthedApi(
        'bets',
        { contractId, kinds: 'open-limit', order: 'asc' },
        { cache: 'no-store', signal }
      )
      return () => {
        if (request !== requestGeneration.current) return false
        setBets(bets as LimitBet[])
      }
    },
    onBroadcast: ({ data }) => {
      requestGeneration.current++
      addBets(data.bets as LimitBet[])
    },
  })

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
    useUnfilledBets(contractId, api, useIsPageVisible, { enabled: true }) ?? []
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
  const requestGeneration = useRef(0)
  useEffect(() => {
    if (!userIds.length || !isPageVisible) return
    const request = ++requestGeneration.current
    api({ ids: userIds }).then((users) => {
      if (request === requestGeneration.current) setUsers(users)
    })
    return () => {
      requestGeneration.current++
    }
  }, [userIds.join(','), isPageVisible])

  // Subscribe to updates
  useApiSubscription({
    topics: userIds.map((id) => `user/${id}`),
    getSnapshot: async (signal) => {
      const request = ++requestGeneration.current
      const users = await unauthedApi(
        'users/by-id/balance',
        { ids: userIds },
        { cache: 'no-store', signal }
      )
      return () => {
        if (request !== requestGeneration.current) return false
        setUsers(users)
      }
    },
    onBroadcast: ({ data }) => {
      requestGeneration.current++
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
