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

// Callbacks get the generation of the read that produced the value, which may
// be a newer read than the one they were waiting on.
export const pendingCallbacks: Map<
  string,
  ((value: any, generation: number, error?: unknown) => void)[]
> = new Map()

type FilterCallback<T> = (data: T[], id: string) => T | undefined

// Per key: requests in flight, and the newest response delivered while any
// are. Dispatch order stands in for snapshot order.
const inFlight = new Map<string, number>()
const newest = new Map<string, { generation: number; value: unknown }>()
let dispatches = 0

export const executeBatchQuery = debounce(async (handlers: QueryHandlers) => {
  const requestsToProcess = pendingRequests.splice(0, pendingRequests.length)
  const key = (queryType: string, id: string) => `${queryType}-${id}`

  const batchPromises = requestsToProcess.map(
    async ({ queryType, ids, userId }) => {
      if (!ids.size) return
      const generation = ++dispatches
      const callbacksById = new Map(
        Array.from(ids, (id) => {
          const k = key(queryType, id)
          inFlight.set(k, (inFlight.get(k) ?? 0) + 1)
          const callbacks = pendingCallbacks.get(k) ?? []
          pendingCallbacks.delete(k)
          return [id, callbacks] as const
        })
      )
      // Once a newer request for the same key has delivered, this request's
      // consumers get that value instead of an older one.
      const newer = (id: string) => {
        const latest = newest.get(key(queryType, id))
        return latest && latest.generation > generation ? latest : undefined
      }

      try {
        const handler = handlers[queryType as keyof QueryHandlers]
        if (!handler) {
          console.error(`No handler found for query type: ${queryType}`)
          return
        }

        const data = await handler({ ids, userId })

        ids.forEach((id) => {
          const result = newer(id) ?? {
            generation,
            value: filtersByQueryType[queryType](data, id),
          }
          if (result.generation === generation)
            newest.set(key(queryType, id), result)
          callbacksById
            .get(id)
            ?.forEach((callback) => callback(result.value, result.generation))
        })
      } catch (error) {
        for (const [id, callbacks] of callbacksById) {
          const latest = newer(id)
          callbacks.forEach((callback) =>
            latest
              ? callback(latest.value, latest.generation)
              : callback(undefined, generation, error)
          )
        }
        console.error(`Error fetching batch data for ${queryType}:`, error)
      } finally {
        for (const id of ids) {
          const k = key(queryType, id)
          const remaining = (inFlight.get(k) ?? 1) - 1
          if (remaining > 0) inFlight.set(k, remaining)
          else {
            inFlight.delete(k)
            newest.delete(k)
          }
        }
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

const marketFilter = (data: Contract[], id: string) =>
  data.find((item) => item.id === id)

export const filtersByQueryType: Record<string, FilterCallback<any>> = {
  markets: marketFilter,
  'markets-fresh': marketFilter,
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

type LiveUpdate<T> = { update: SetStateAction<T>; dispatched: number }

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
    | 'markets-fresh'
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
  // Live updates received while a read is in flight, with how many reads had
  // been dispatched when each arrived.
  const liveUpdates = useRef<LiveUpdate<T>[] | undefined>(undefined)
  const setState = useEvent((update: SetStateAction<T>) => {
    liveUpdates.current?.push({ update, dispatched: dispatches })
    saveState(update)
  })

  const MAX_BATCH_SIZE = 38

  useEffect(() => {
    if (!enabled) return
    let active = true
    const updates: LiveUpdate<T>[] = []
    liveUpdates.current = updates
    const receive = (value: T, generation: number, error?: unknown) => {
      if (!active) return
      liveUpdates.current = undefined
      if (error) return
      // Replay only updates that arrived after the read producing this value
      // was dispatched. Earlier ones are already in its response, and
      // replaying them would revert anything newer it contains.
      saveState(
        updates
          .filter(({ dispatched }) => dispatched >= generation)
          .reduce<T>(
            (current, { update }) =>
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
