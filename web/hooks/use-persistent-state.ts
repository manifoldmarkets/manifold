import { useEffect } from 'react'
import { useStateCheckEquality } from './use-state-check-equality'
import { NextRouter, useRouter } from 'next/router'

export type PersistenceOptions<T> = { key: string; store: PersistentStore<T> }

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

export const storageStore = <T>(storage?: Storage): PersistentStore<T> => ({
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

export const usePersistentState = <T>(
  initial: T,
  persist?: PersistenceOptions<T>
) => {
  const store = persist?.store
  const key = persist?.key
  // note that it's important in some cases to get the state correct during the
  // first render, or scroll restoration won't take into account the saved state
  const savedValue = key != null && store != null ? store.get(key) : undefined
  const [state, setState] = useStateCheckEquality(savedValue ?? initial)
  useEffect(() => {
    if (key != null && store != null) {
      store.set(key, state)
    }
  }, [key, state])

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

  return [state, setState] as const
}
