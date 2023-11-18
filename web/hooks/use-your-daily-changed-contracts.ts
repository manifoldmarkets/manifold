import { useEffect } from 'react'
import { CPMMContract } from 'common/contract'
import { getYourDailyChangedContracts } from 'web/lib/supabase/contracts'
import { SupabaseClient } from 'common/supabase/utils'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

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
