import { useEffect } from 'react'
import { Contract } from 'common/contract'
import { getYourDailyChangedContracts } from 'web/lib/supabase/contracts'
import { SupabaseClient } from 'common/supabase/utils'
import { inMemoryStore, usePersistentState } from './use-persistent-state'

export function useYourDailyChangedContracts(
  db: SupabaseClient,
  userId: string | null | undefined
) {
  const [contracts, setContracts] = usePersistentState<Contract[] | undefined>(
    undefined,
    {
      key: 'your-daily-changed-contracts',
      store: inMemoryStore(),
    }
  )

  useEffect(() => {
    if (!userId) return

    getYourDailyChangedContracts(db, userId, 10).then((contracts) => {
      setContracts(contracts)
    })
  }, [userId])

  return contracts
}
