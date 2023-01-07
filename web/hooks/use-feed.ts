import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useEffect } from 'react'
import { usePersistentState, inMemoryStore } from './use-persistent-state'
import { db } from 'web/lib/supabase/db'

export const useFeed = (user: User | null | undefined, count: number) => {
  const [savedContracts, setSavedContracts] = usePersistentState<
    Contract[] | undefined
  >(undefined, { key: 'home-recommended-contracts', store: inMemoryStore() })

  const userId = user?.id

  useEffect(() => {
    if (userId) {
      db.rpc('get_recommended_contracts' as any, { uid: userId, count }).then(
        (res) => {
          const contracts = res.data as Contract[]
          setSavedContracts(contracts)
        }
      )
    }
  }, [setSavedContracts, userId, count])

  return savedContracts
}
