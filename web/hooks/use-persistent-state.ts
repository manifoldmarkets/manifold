import { useLayoutEffect, useEffect } from 'react'
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
