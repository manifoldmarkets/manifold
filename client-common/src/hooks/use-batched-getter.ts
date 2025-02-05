import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { useEffect } from 'react'
import { Contract } from 'common/contract'
import { Reaction } from 'common/reaction'
import { DisplayUser } from 'common/api/user-types'
import { debounce } from 'lodash'

export const pendingRequests: {
  queryType: string
  ids: Set<string>
  userId?: string
}[] = []

export const pendingCallbacks: Map<string, ((data: any) => void)[]> = new Map()

type FilterCallback<T> = (data: T[], id: string) => T | undefined

export const executeBatchQuery = debounce(async (handlers: QueryHandlers) => {
  const requestsToProcess = pendingRequests.splice(0, pendingRequests.length)
  const key = (queryType: string, id: string) => `${queryType}-${id}`

  const batchPromises = requestsToProcess.map(
    async ({ queryType, ids, userId }) => {
      if (!ids.size) return

      try {
        const handler = handlers[queryType as keyof QueryHandlers]
        if (!handler) {
          console.error(`No handler found for query type: ${queryType}`)
          return
        }

        const data = await handler({ ids, userId })

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
    executeBatchQuery(handlers)
  }
}, 10)

export const filtersByQueryType: Record<string, FilterCallback<any>> = {
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

export type BatchQueryParams = { ids: Set<string>; userId?: string }
export type QueryHandler<T> = (params: BatchQueryParams) => Promise<T>
export type QueryHandlers = {
  [queryType: string]: QueryHandler<
    Contract[] | Reaction[] | string[] | DisplayUser[]
  >
}

export const useBatchedGetter = <T>(
  handlers: QueryHandlers,
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

  const MAX_BATCH_SIZE = 38

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

    executeBatchQuery(handlers)

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
