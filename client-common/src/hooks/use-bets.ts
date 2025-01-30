import { APIParams, APIResponse } from 'common/api/schema'
import { Bet, LimitBet } from 'common/bet'
import { sortBy, uniq, uniqBy } from 'lodash'
import { Dispatch, SetStateAction, useEffect } from 'react'
import { useApiSubscription } from './use-api-subscription'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { usePollUserBalances } from './use-poll-user-balances'

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

export const useUnfilledBets = (
  contractId: string,
  useIsPageVisible: () => boolean,
  api: (params: APIParams<'bets'>) => Promise<APIResponse<'bets'>>,
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
      api({ contractId, kinds: 'open-limit', order: 'asc' }).then(
        // Reset bets instead of adding to existing, since we want to exclude those recently filled/cancelled.
        (bets) => setBets(bets as LimitBet[])
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

export const useUnfilledBetsAndBalanceByUserId = (
  contractId: string,
  useIsPageVisible: () => boolean,
  api: (params: APIParams<'bets'>) => Promise<APIResponse<'bets'>>
) => {
  const unfilledBets = useUnfilledBets(contractId, useIsPageVisible, api) ?? []
  const userIds = uniq(unfilledBets.map((b) => b.userId))
  const balances = usePollUserBalances(userIds) ?? []

  const balanceByUserId = Object.fromEntries(
    balances.map(({ id, balance }) => [id, balance])
  )
  return { unfilledBets, balanceByUserId }
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
    (options.kinds === 'open-limit' && (bet.isFilled || bet.isCancelled))

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
