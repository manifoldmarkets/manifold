import { useEffect } from 'react'
import { useStateCheckEquality } from './use-state-check-equality'
import { NextRouter, useRouter } from 'next/router'
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
  readsUrl?: boolean
}

const withURLParam = (location: Location, k: string, v?: string) => {
  const newParams = new URLSearchParams(location.search)
  if (!v) {
    newParams.delete(k)
  } else {
    newParams.set(k, v)
  }
  const newUrl = new URL(location.href)
  newUrl.search = newParams.toString()
  return newUrl
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

export const urlParamStore = (router: NextRouter): PersistentStore<string> => ({
  get: (k: string) => {
    const v = router.query[k]
    return typeof v === 'string' ? v : undefined
  },
  set: (k: string, v: string | undefined) => {
    if (typeof window !== 'undefined') {
      // see relevant discussion here https://github.com/vercel/next.js/discussions/18072
      const url = withURLParam(window.location, k, v).toString()
      const updatedState = { ...window.history.state, as: url, url }
      window.history.replaceState(updatedState, '', url)
    }
  },
  readsUrl: true,
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

  if (store?.readsUrl) {
    // On route change on the same page, set the state.
    // On page load, router isn't ready immediately, so set state once it is.

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const router = useRouter()
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (router.isReady) {
        const savedValue = key != null ? store.get(key) : undefined
        setState(savedValue ?? initial)
      }
    }, [router.isReady, router.query])
  }

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

  if (store?.readsUrl) {
    // On page load, router isn't ready immediately, so set state once it is.

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const router = useRouter()
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (router.isReady) {
        const savedValue = key != null ? store.get(key) : undefined
        setState(savedValue ?? initial)
      }
    }, [router.isReady])
  }

  return [state ?? savedValue, setState] as const
}
