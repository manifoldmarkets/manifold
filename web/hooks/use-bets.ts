import { useEffect } from 'react'
import { Bet, LimitBet } from 'common/bet'
import { usePollUserBalances } from './use-user'
import { uniq } from 'lodash'
import { db } from 'web/lib/supabase/db'
import { getBets } from 'common/supabase/bets'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useLiveUpdates } from './use-persistent-supabase-polling'

export const useUnfilledBets = (
  contractId: string,
  options?: {
    waitUntilAdvancedTrader: boolean
  }
) => {
  const [bets, setBets] = usePersistentInMemoryState<LimitBet[] | undefined>(
    undefined,
    `unfilled-bets-${contractId}`
  )

  const pollBets = useLiveUpdates(
    () => getBets(db, { contractId, isOpenLimitOrder: true }),
    {
      listen: !options?.waitUntilAdvancedTrader,
    }
  )

  useEffect(() => {
    if (pollBets) {
      setBets(
        (pollBets as LimitBet[]).filter(
          (bet) => !bet.expiresAt || bet.expiresAt > Date.now()
        )
      )
    }
  }, [pollBets])

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
