import { run } from 'common/supabase/utils'
import { debounce } from 'lodash'
import { db } from 'web/lib/supabase/db'
import { useEffect } from 'react'
import { api } from 'web/lib/api/api'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { Reaction } from 'common/reaction'
import { Contract } from 'common/contract'

const pendingRequests: Map<
  string,
  { ids: Set<string>; filterCallback: FilterCallback<any> }
> = new Map()
const pendingCallbacks: Map<string, ((data: any) => void)[]> = new Map()

type FilterCallback<T> = (data: T[], id: string) => T | undefined

const executeBatchQuery = debounce(async () => {
  for (const [
    queryType,
    { ids, filterCallback },
  ] of pendingRequests.entries()) {
    if (!ids.size) continue
    console.log('executing batch query', queryType, ids)
    let data: Contract[] | Reaction[]
    try {
      switch (queryType) {
        case 'markets':
          data = await api('markets-by-ids', { ids: Array.from(ids) })
          break
        case 'comment-likes':
        case 'contract-likes':
          const contentType = queryType.split('-')[0]
          const { data: likesData } = await run(
            db
              .from('user_reactions')
              .select()
              .eq('content_type', contentType)
              .in('content_id', Array.from(ids))
          )
          data = likesData
          break
      }

      ids.forEach((id) => {
        const key = `${queryType}-${id}`
        const callbacks = pendingCallbacks.get(key) || []
        const filteredData = filterCallback(data, id)
        callbacks.forEach((callback) => callback(filteredData))
        pendingCallbacks.delete(key)
      })
    } catch (error) {
      console.error('Error fetching batch data:', error)
    }

    pendingRequests.delete(queryType)
  }
}, 10)

const defaultFilters: Record<string, FilterCallback<any>> = {
  markets: (data: Contract[], id: string) =>
    (data ?? []).find((item) => item.id === id),
  'comment-likes': (data: Reaction[], id: string) =>
    (data || []).filter((item) => item.content_id === id),
  'contract-likes': (data: Reaction[], id: string) =>
    (data || []).filter((item) => item.content_id === id),
}

export const useBatchedGetter = <T>(
  queryType: 'markets' | 'comment-likes' | 'contract-likes',
  id: string,
  initialValue: T,
  enabled = true,
  customFilter?: FilterCallback<T>
) => {
  useEffect(() => {
    if (!enabled) return

    if (!pendingRequests.has(queryType)) {
      pendingRequests.set(queryType, {
        ids: new Set(),
        filterCallback: customFilter ?? defaultFilters[queryType],
      })
    }
    pendingRequests.get(queryType)!.ids.add(id)

    const key = `${queryType}-${id}`
    if (!pendingCallbacks.has(key)) {
      pendingCallbacks.set(key, [])
    }

    const setData = (data: T) => {
      setState(data)
    }
    pendingCallbacks.get(key)!.push(setData)

    executeBatchQuery()

    return () => {
      const callbacks = pendingCallbacks.get(key)
      if (callbacks) {
        const index = callbacks.indexOf(setData)
        if (index > -1) {
          callbacks.splice(index, 1)
        }
        if (callbacks.length === 0) {
          pendingCallbacks.delete(key)
        }
      }
    }
  }, [queryType, id, enabled])

  const [state, setState] = usePersistentInMemoryState<T>(
    initialValue,
    `${queryType}-${id}`
  )

  return [state, setState] as const
}
