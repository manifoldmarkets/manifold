import { uniq, uniqBy, sortBy } from 'lodash'
import { useEffect } from 'react'

import { Bet, LimitBet } from 'common/bet'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { usePollUserBalances } from './use-user'
import { api } from 'web/lib/api/api'
import { APIParams } from 'common/api/schema'
import { useIsPageVisible } from './use-page-visible'

export function useBetsOnce(options: APIParams<'bets'>) {
  const [bets, setBets] = usePersistentInMemoryState<Bet[] | undefined>(
    undefined,
    `use-bets-${JSON.stringify(options)}`
  )

  useEffectCheckEquality(() => {
    api('bets', options ?? {}).then((bets) => setBets(bets))
  }, [options])

  return bets
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
      api('bets', { contractId, kinds: 'open-limit', order: 'asc' }).then(
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

export const useUnfilledBetsAndBalanceByUserId = (contractId: string) => {
  const unfilledBets = useUnfilledBets(contractId) ?? []
  const userIds = uniq(unfilledBets.map((b) => b.userId))
  const balances = usePollUserBalances(userIds) ?? []

  const balanceByUserId = Object.fromEntries(
    balances.map(({ id, balance }) => [id, balance])
  )
  return { unfilledBets, balanceByUserId }
}
