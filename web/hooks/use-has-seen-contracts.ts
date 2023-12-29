import { useIsAuthorized } from 'web/hooks/use-user'
import { useEffect } from 'react'
import { getSeenContractIds } from 'web/lib/supabase/user-events'
import { DAY_MS } from 'common/util/time'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { orderBy, uniq } from 'lodash'

export const useHasSeenContracts = (
  userId: string | null | undefined,
  contractIds: string[],
  since: number = Date.now() - DAY_MS * 5
) => {
  const orderedUniqueContractIds = uniq(orderBy(contractIds))
  const isAuthed = useIsAuthorized()
  const [seenContractIds, setSeenContractIds] = usePersistentInMemoryState<
    string[]
  >([], 'seenContractIds-' + userId + '-' + orderedUniqueContractIds.join(','))
  useEffect(() => {
    if (!isAuthed || !userId) return
    getSeenContractIds(userId, orderedUniqueContractIds, since, [
      'view market card',
      'view market',
    ]).then(setSeenContractIds)
  }, [isAuthed, userId])
  return seenContractIds
}
