import { useEffect } from 'react'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { db } from 'web/lib/supabase/db'
import { DAY_MS } from 'common/util/time'

export const useRecentUniqueBettors = (contractId: string) => {
  const [recentUniqueBettors, setRecentUniqueBettors] =
    usePersistentInMemoryState(0, `recentUniqueBettors-${contractId}`)
  useEffect(() => {
    db.rpc('get_unique_bettors_since', {
      this_contract_id: contractId,
      since: Date.now() - DAY_MS,
    }).then(({ data }) => {
      setRecentUniqueBettors(Number(data))
    })
  }, [contractId])
  return recentUniqueBettors
}
