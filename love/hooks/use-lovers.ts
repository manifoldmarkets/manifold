import { sortBy } from 'lodash'
import { useEffect } from 'react'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { api } from 'web/lib/firebase/api'
import { APIResponse } from 'common/api/schema'
import { useLoverByUserId } from './use-lover'
import { getLoversCompatibilityFactor } from 'common/love/compatibility-score'

export const useCompatibleLovers = (
  userId: string | null | undefined,
  options?: { sortWithModifiers?: boolean }
) => {
  const [data, setData] = usePersistentInMemoryState<
    APIResponse<'compatible-lovers'> | undefined | null
  >(undefined, `compatible-lovers-${userId}`)

  const lover = useLoverByUserId(userId ?? undefined)

  useEffect(() => {
    if (userId) {
      api('compatible-lovers', { userId })
        .then(setData)
        .catch((e) => {
          if (e.code === 404) {
            setData(null)
          } else {
            throw e
          }
        })
    } else if (userId === null) setData(null)
  }, [userId])

  if (data && lover && options?.sortWithModifiers) {
    data.compatibleLovers = sortBy(data.compatibleLovers, (l) => {
      const modifier = !lover ? 1 : getLoversCompatibilityFactor(lover, l)
      return -1 * modifier * data.loverCompatibilityScores[l.user.id].score
    })
  }

  return data
}
