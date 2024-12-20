import { run } from 'common/supabase/utils'
import { debounce } from 'lodash'
import { db } from 'web/lib/supabase/db'
import { useEffect } from 'react'
import { api } from 'web/lib/api/api'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { Reaction } from 'common/reaction'
import { Contract } from 'common/contract'
import { getContractIdsWithMetrics } from 'common/supabase/contract-metrics'
import { DisplayUser } from 'common/api/user-types'
import { getDisplayUsers } from 'web/lib/supabase/users'

const pendingRequests: {
  queryType: string
  ids: Set<string>
  userId?: string
}[] = []
const pendingCallbacks: Map<string, ((data: any) => void)[]> = new Map()

type FilterCallback<T> = (data: T[], id: string) => T | undefined

const executeBatchQuery = debounce(async () => {
  const requestsToProcess = pendingRequests.splice(0, pendingRequests.length)
  const key = (queryType: string, id: string) => `${queryType}-${id}`

  const batchPromises = requestsToProcess.map(
    async ({ queryType, ids, userId }) => {
      if (!ids.size) return

      try {
        let data: Contract[] | Reaction[] | string[] | DisplayUser[]

        switch (queryType) {
          case 'markets':
            data = await api('markets-by-ids', { ids: Array.from(ids) })
            break
          case 'comment-reactions':
          case 'contract-reactions':
            const contentType = queryType.split('-')[0]
            const { data: reactionsData } = await run(
              db
                .from('user_reactions')
                .select()
                .eq('content_type', contentType)
                .in('content_id', Array.from(ids))
            )
            data = reactionsData
            break
          case 'contract-metrics':
            if (!userId) {
              data = []
              break
            }
            data = await getContractIdsWithMetrics(db, userId, Array.from(ids))
            break
          case 'user':
            data = await getDisplayUsers(Array.from(ids))
            break
          case 'users':
            const userIds = Array.from(ids).flatMap((id) => id.split(','))
            data = await getDisplayUsers(userIds)
            break
        }

        ids.forEach((id) => {
          const callbacks = pendingCallbacks.get(key(queryType, id)) || []
          pendingCallbacks.delete(key(queryType, id))
          const filteredData = filtersByQueryType[queryType](data, id)
          callbacks.forEach((callback) => callback(filteredData))
        })
      } catch (error) {
        console.error(`Error fetching batch data for ${queryType}:`, error)
      }
    }
  )

  await Promise.allSettled(batchPromises)

  // If there are new pending requests, trigger another batch
  if (pendingRequests.length > 0) {
    executeBatchQuery()
  }
}, 10)

const filtersByQueryType: Record<string, FilterCallback<any>> = {
  markets: (data: Contract[], id: string) =>
    data.find((item) => item.id === id),
  'comment-reactions': (data: Reaction[], id: string) =>
    data.filter((item) => item.content_id === id),
  'contract-reactions': (data: Reaction[], id: string) =>
    data.filter((item) => item.content_id === id),
  'contract-metrics': (data: string[], id: string) => data.includes(id),
  user: (data: DisplayUser[], id: string) =>
    data.find((item) => item.id === id),
  users: (data: DisplayUser[], id: string) =>
    id.split(',').map((userId) => data.find((u) => u.id === userId) ?? null),
}

export const useBatchedGetter = <T>(
  queryType:
    | 'markets'
    | 'comment-reactions'
    | 'contract-reactions'
    | 'contract-metrics'
    | 'user'
    | 'users',
  id: string,
  initialValue: T,
  enabled = true,
  userId?: string
) => {
  const key = `${queryType}-${id}`
  const [state, setState] = usePersistentInMemoryState<T>(initialValue, key)

  const MAX_BATCH_SIZE = 60

  useEffect(() => {
    if (!enabled) return

    // Find the latest batch for this query type
    let currentBatch = pendingRequests.findLast(
      (batch) => batch.queryType === queryType
    )

    // Create new batch if needed
    if (!currentBatch || currentBatch.ids.size >= MAX_BATCH_SIZE) {
      currentBatch = {
        queryType,
        ids: new Set(),
        userId,
      }
      pendingRequests.push(currentBatch)
    }

    currentBatch.ids.add(id)

    if (!pendingCallbacks.has(key)) {
      pendingCallbacks.set(key, [])
    }
    pendingCallbacks.get(key)!.push(setState)

    executeBatchQuery()

    return () => {
      const callbacks = pendingCallbacks.get(key)
      if (callbacks) {
        const index = callbacks.indexOf(setState)
        if (index > -1) {
          callbacks.splice(index, 1)
        }
        if (callbacks.length === 0) {
          pendingCallbacks.delete(key)
        }
      }
    }
  }, [queryType, id, enabled, userId])

  return [state, setState] as const
}
