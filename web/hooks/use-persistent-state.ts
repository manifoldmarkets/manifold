import { useLayoutEffect, useEffect, useState } from 'react'
import { useStateCheckEquality } from './use-state-check-equality'

export type PersistenceOptions = {
  store?: Storage
  prefix: string
  name: string
}

export const getKey = (prefix: string, name: string) => `${prefix}-${name}`

export const saveState = (key: string, val: unknown, store: Storage) => {
  if (val === undefined) {
    store.removeItem(key)
  } else {
    store.setItem(key, JSON.stringify(val))
  }
}

export const loadState = (key: string, store: Storage) => {
  const saved = store.getItem(key)
  if (typeof saved === 'string') {
    try {
      return JSON.parse(saved) as unknown
    } catch (e) {
      console.error(e)
    }
  } else {
    return undefined
  }
}

const STATE_KEY = '__manifold'

const getHistoryState = <T>(k: string) => {
  if (typeof window !== 'undefined') {
    return window.history.state?.options?.[STATE_KEY]?.[k] as T | undefined
  } else {
    return undefined
  }
}

const setHistoryState = (k: string, v: any) => {
  if (typeof window !== 'undefined') {
    const state = window.history.state ?? {}
    const options = state.options ?? {}
    const inner = options[STATE_KEY] ?? {}
    window.history.replaceState(
      { ...state, options: { ...options, [STATE_KEY]: { ...inner, [k]: v } } },
      ''
    )
  }
}

export const useHistoryState = <T>(key: string, initialValue: T) => {
  const [state, setState] = useState(getHistoryState<T>(key) ?? initialValue)
  const setter = (val: T) => {
    console.log('Setting state: ', val)
    setHistoryState(key, val)
    setState(val)
  }
  return [state, setter] as const
}

export const usePersistentState = <T>(
  initial: T,
  persist?: PersistenceOptions
) => {
  const store = persist?.store
  const key = persist ? getKey(persist.prefix, persist.name) : null
  useLayoutEffect(() => {
    if (key != null && store != null) {
      const saved = loadState(key, store) as T
      console.log('Loading state for: ', key, saved)
      if (saved !== undefined) {
        setState(saved)
      }
    }
  }, [])
  const [state, setState] = useStateCheckEquality(initial)
  useEffect(() => {
    if (key != null && store != null) {
      console.log('Saving state for: ', key, state)
      saveState(key, state, store)
    }
  }, [key, state, store])
  return [state, setState] as const
}
