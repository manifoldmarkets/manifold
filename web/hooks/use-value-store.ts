import { useSyncExternalStore } from 'react'

// A value kept outside React state. Setting it re-renders only the components
// that read it with useValueStore, not the component that owns the store. Use
// it for state that changes many times a second and that few components show,
// like which row the pointer is on.
export type ValueStore<T> = {
  get: () => T
  set: (value: T) => void
  subscribe: (listener: () => void) => () => void
}

export const createValueStore = <T>(initial: T): ValueStore<T> => {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const useValueStore = <T>(store: ValueStore<T>) =>
  useSyncExternalStore(store.subscribe, store.get, store.get)
