import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { SetStateAction, useEffect, useRef } from 'react'
import { useEvent } from './use-event'
import { Contract } from 'common/contract'
import { Reaction } from 'common/reaction'
import { DisplayUser } from 'common/api/user-types'
import { debounce } from 'lodash'

export const pendingRequests: {
  queryType: string
  ids: Set<string>
  userId?: string
}[] = []

export const pendingCallbacks: Map<
  string,
  ((data: any, error?: unknown) => void)[]
> = new Map()

type FilterCallback<T> = (data: T[], id: string) => T | undefined

export const executeBatchQuery = debounce(async (handlers: QueryHandlers) => {
  const requestsToProcess = pendingRequests.splice(0, pendingRequests.length)
  const key = (queryType: string, id: string) => `${queryType}-${id}`

  const batchPromises = requestsToProcess.map(
    async ({ queryType, ids, userId }) => {
      if (!ids.size) return
      const callbacksById = new Map(
        Array.from(ids, (id) => {
          const callbacks = pendingCallbacks.get(key(queryType, id)) ?? []
          pendingCallbacks.delete(key(queryType, id))
          return [id, callbacks] as const
        })
      )

      try {
        const handler = handlers[queryType as keyof QueryHandlers]
        if (!handler) {
          console.error(`No handler found for query type: ${queryType}`)
          return
        }

        const data = await handler({ ids, userId })

        ids.forEach((id) => {
          const callbacks = callbacksById.get(id) ?? []
          const filteredData = filtersByQueryType[queryType](data, id)
          callbacks.forEach((callback) => callback(filteredData))
        })
      } catch (error) {
        for (const callbacks of callbacksById.values()) {
          callbacks.forEach((callback) => callback(undefined, error))
        }
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

const reactionsFilter = (data: Reaction[], id: string) =>
  data.filter((item) => item.content_id === id)

export const filtersByQueryType: Record<string, FilterCallback<any>> = {
  markets: (data: Contract[], id: string) =>
    data.find((item) => item.id === id),
  'comment-reactions': reactionsFilter,
  'post-reactions': reactionsFilter,
  'contract-reactions': reactionsFilter,
  'post-comment-likes': reactionsFilter,
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
    | 'post-reactions'
    | 'contract-metrics'
    | 'post-comment-likes'
    | 'user'
    | 'users',
  id: string,
  initialValue: T,
  enabled = true,
  userId?: string,
  refreshKey = 0
) => {
  const key = `${queryType}-${id}`
  const [state, saveState] = usePersistentInMemoryState<T>(initialValue, key)
  const liveUpdates = useRef<SetStateAction<T>[] | undefined>(undefined)
  const setState = useEvent((update: SetStateAction<T>) => {
    liveUpdates.current?.push(update)
    saveState(update)
  })

  const MAX_BATCH_SIZE = 38

  useEffect(() => {
    if (!enabled) return
    let active = true
    const updates: SetStateAction<T>[] = []
    liveUpdates.current = updates
    const receive = (value: T, error?: unknown) => {
      if (!active) return
      liveUpdates.current = undefined
      if (error) return
      saveState(
        updates.reduce<T>(
          (current, update) =>
            typeof update === 'function'
              ? (update as (prev: T) => T)(current)
              : update,
          value
        )
      )
    }

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
    pendingCallbacks.get(key)!.push(receive)

    executeBatchQuery(handlers)

    return () => {
      active = false
      if (liveUpdates.current === updates) liveUpdates.current = undefined
      const callbacks = pendingCallbacks.get(key)
      if (callbacks) {
        const index = callbacks.indexOf(receive)
        if (index > -1) {
          callbacks.splice(index, 1)
        }
        if (callbacks.length === 0) {
          pendingCallbacks.delete(key)
        }
      }
    }
  }, [queryType, id, enabled, userId, refreshKey])

  return [state, setState] as const
}
