import { APIParams, APIPath, APIResponse } from 'common/api/schema'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { Bet } from 'common/bet'
import { useEffect } from 'react'
import { useApiSubscription } from './use-api-subscription'
import { sortBy, uniqBy } from 'lodash'
import { LimitBet } from 'common/bet'

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

  // We have to listen to cancels as well, since we don't get them in the `new-bet` topic.
  useApiSubscription({
    topics: [`contract/${contractId}/orders`],
    onBroadcast: (msg) => {
      const betUpdates = msg.data.bets as LimitBet[]
      const cancelledBets = betUpdates.filter(
        (bet: LimitBet) => bet.isCancelled
      )
      setNewBets((currentBets) => {
        return currentBets.map((bet) => {
          const cancelledBet = cancelledBets.find(
            (cancelledBet) => cancelledBet.id === bet.id
          )
          return cancelledBet ? { ...bet, isCancelled: true } : bet
        })
      })
    },
    enabled,
  })

  return newBets
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
