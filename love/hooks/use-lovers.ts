import { sortBy } from 'lodash'
import { useEffect } from 'react'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { api } from 'web/lib/firebase/api'
import { API } from 'common/api/schema'
import { useLoverByUserId } from './use-lover'
import { getLoversCompatibilityFactor } from 'common/love/compatibility-score'

export const useCompatibleLovers = (
  userId: string | null | undefined,
  options?: { sortWithLocationPenalty?: boolean }
) => {
  const [data, setData] = usePersistentInMemoryState<
    (typeof API)['compatible-lovers']['returns'] | undefined | null
  >(undefined, `compatible-lovers-${userId}`)

  const lover = useLoverByUserId(userId ?? undefined)

  useEffect(() => {
    if (userId) {
      api('compatible-lovers', { userId })
        .then((result) => {
          const { compatibleLovers, loverCompatibilityScores } = result
          if (options?.sortWithLocationPenalty) {
            result.compatibleLovers = sortBy(compatibleLovers, (l) => {
              const modifier = !lover
                ? 1
                : getLoversCompatibilityFactor(lover, l)
              return modifier * loverCompatibilityScores[l.user.id].score
            }).reverse()
          }
          setData(result)
        })
        .catch((e) => {
          if (e.code === 404) {
            setData(null)
          } else {
            throw e
          }
        })
    } else if (userId === null) setData(null)
  }, [userId])

  return data
}
