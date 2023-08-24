import { useEffect } from 'react'
import { useStateCheckEquality } from './use-state-check-equality'
import { useHasLoaded } from './use-has-loaded'

export type PersistenceOptions<T> = { key: string; store: PersistentStore<T> }
export type RevalidationOptions<T> = {
  every: number
  // callback is async with results of the revalidation
  callback: () => Promise<T>
}

export type Backend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface PersistentStore<T> {
  get: (k: string) => T | undefined
  set: (k: string, v: T | undefined) => void
}

export const storageStore = <T>(
  storage: Backend | undefined
): PersistentStore<T> => ({
  get: (k: string) => {
    if (!storage) {
      return undefined
    }
    const saved = storage.getItem(k)
    if (typeof saved === 'string') {
      try {
        return JSON.parse(saved) as T
      } catch (e) {
        console.error(e)
      }
    } else {
      return undefined
    }
  },
  set: (k: string, v: T | undefined) => {
    if (storage) {
      if (v === undefined) {
        storage.removeItem(k)
      } else {
        storage.setItem(k, JSON.stringify(v))
      }
    }
  },
})

export const historyStore = <T>(prefix = '__manifold'): PersistentStore<T> => ({
  get: (k: string) => {
    if (typeof window !== 'undefined') {
      return window.history.state?.options?.[prefix]?.[k] as T | undefined
    } else {
      return undefined
    }
  },
  set: (k: string, v: T | undefined) => {
    if (typeof window !== 'undefined') {
      const state = window.history.state ?? {}
      const options = state.options ?? {}
      const inner = options[prefix] ?? {}
      window.history.replaceState(
        {
          ...state,
          options: { ...options, [prefix]: { ...inner, [k]: v } },
        },
        ''
      )
    }
  },
})

const store: Record<string, any> = {}

export const inMemoryStore = <T>(): PersistentStore<T> => ({
  get: (k: string) => {
    return store[k]
  },
  set: (k: string, v: T | undefined) => {
    store[k] = v
  },
})

/** @deprecated  - use usePersistentLocalState or write new hook */
export const usePersistentState = <T>(
  initial: T,
  persist?: PersistenceOptions<T>
) => {
  const store = persist?.store
  const key = persist?.key
  const hasLoaded = useHasLoaded()

  // Note that it's important in some cases to get the state correct during the
  // first render, or scroll restoration won't take into account the saved state.
  // However, if this is the first server render, we don't want to read from the store,
  // because it could cause a hydration error.
  const savedValue =
    hasLoaded && key != null && store != null ? store.get(key) : undefined

  const [state, setState] = useStateCheckEquality(savedValue ?? initial)
  useEffect(() => {
    if (hasLoaded && key != null && store != null) {
      store.set(key, state)
    }
  }, [key, state, hasLoaded])

  return [state, setState] as const
}

/** @deprecated  - use usePersistentLocalState or write new hook */
export const usePersistentRevalidatedState = <T>(
  initial: T,
  persist: PersistenceOptions<T>,
  revalidation: RevalidationOptions<T>
) => {
  const { key, store } = persist
  // Is there any reason why a persistent store couldn't write a string?
  const stringStore = store as PersistentStore<any>
  const lastUpdateTimeKey = `${key}-last-update-time`
  const hasLoaded = useHasLoaded()
  const { every, callback } = revalidation

  // Note that it's important in some cases to get the state correct during the
  // first render, or scroll restoration won't take into account the saved state.
  // However, if this is the first server render, we don't want to read from the store,
  // because it could cause a hydration error.
  const savedValue =
    hasLoaded && key != null && store != null ? store.get(key) : undefined

  const [state, setState] = useStateCheckEquality(savedValue ?? initial)

  useEffect(() => {
    if (!hasLoaded || key === null || store === null) return
    const lastUpdateTime = parseInt(stringStore.get(lastUpdateTimeKey) ?? 0)
    const now = Date.now()
    if (lastUpdateTime + every < now) {
      stringStore.set(lastUpdateTimeKey, now.toString())
      callback().then(setState)
    }
  }, [])

  useEffect(() => {
    if (hasLoaded && key != null && store != null && state !== undefined) {
      store.set(key, state)
    }
  }, [key, state, hasLoaded])

  return [state ?? savedValue, setState] as const
}
