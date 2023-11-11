import { CPMMMultiContract } from 'common/contract'
import { getMatches } from 'love/lib/supabase/lovers'
import { useEffect } from 'react'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export const useMatches = (userId: string) => {
  const [matches, setMatches] = usePersistentInMemoryState<
    CPMMMultiContract[] | undefined
  >(undefined, `matches-${userId}`)

  useEffect(() => {
    getMatches(userId).then(setMatches)
  }, [userId])

  return matches
}
