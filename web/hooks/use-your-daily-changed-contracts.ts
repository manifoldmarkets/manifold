import { useEffect } from 'react'
import { Contract, CPMMContract } from 'common/contract'
import {
  getYourDailyChangedContracts,
  getYourRecentContracts,
  getYourTrendingContracts,
} from 'web/lib/supabase/contracts'
import { SupabaseClient } from 'common/supabase/utils'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

export function useYourRecentContracts(
  db: SupabaseClient,
  userId: string | null | undefined
) {
  const [contracts, setContracts] = usePersistentInMemoryState<
    CPMMContract[] | undefined
  >(undefined, 'your-recent-contracts')

  useEffect(() => {
    if (!userId) return

    getYourRecentContracts(db, userId, 20).then((contracts) => {
      if (!contracts) setContracts([])
      else setContracts(contracts)
    })
  }, [userId])

  return contracts
}

export function useYourDailyChangedContracts(
  db: SupabaseClient,
  userId: string | null | undefined,
  count: number
) {
  const [contracts, setContracts] = usePersistentInMemoryState<
    CPMMContract[] | undefined
  >(undefined, 'your-daily-changed-contracts')

  useEffect(() => {
    if (!userId) return

    getYourDailyChangedContracts(db, userId, count).then((contracts) => {
      if (!contracts) setContracts([])
      else setContracts(contracts)
    })
  }, [userId, count])

  return contracts
}

export function useYourTrendingContracts(
  db: SupabaseClient,
  userId: string | null | undefined,
  count: number
) {
  const [contracts, setContracts] = usePersistentInMemoryState<
    Contract[] | undefined
  >(undefined, 'your-trending-contracts')

  useEffect(() => {
    if (!userId) return

    getYourTrendingContracts(db, userId, count).then((contracts) => {
      setContracts(contracts)
    })
  }, [userId])

  return contracts
}
