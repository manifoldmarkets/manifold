import { Dictionary, isEqual } from 'lodash'
import { useEffect } from 'react'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { useEvent } from './use-event'
import { useForceUpdate } from './use-force-update'

const store: Dictionary<any> = {}
const storeListeners: Dictionary<((data: any) => void)[]> = {}

const updateValue = (key: string, value: any) => {
  if (isEqual(store[key], value)) return

  store[key] = value
  storeListeners[key]?.forEach((l) => l(value))
}

export const useStore = <T>(
  key: string | undefined,
  listenForValue: (key: string, setValue: (value: T) => void) => void
) => {
  const forceUpdate = useForceUpdate()
  const listener = useEvent(listenForValue)

  useEffect(() => {
    if (key === undefined) return

    if (!storeListeners[key]) {
      storeListeners[key] = []
      listener(key, (value) => updateValue(key, value))
    }

    storeListeners[key].push(forceUpdate)

    return () => {
      storeListeners[key] = storeListeners[key].filter((l) => l !== forceUpdate)
    }
  }, [key, forceUpdate, listener])

  if (key === undefined) return undefined

  return store[key] as T | undefined
}

export const useStoreItems = <T>(
  keys: string[],
  listenForValue: (key: string, setValue: (value: T) => void) => void
) => {
  const forceUpdate = useForceUpdate()
  const listener = useEvent(listenForValue)

  useEffectCheckEquality(() => {
    for (const key of keys) {
      if (!storeListeners[key]) {
        storeListeners[key] = []
        listener(key, (value) => updateValue(key, value))
      }
    }

    const listeners = keys.map(
      (key) =>
        [
          key,
          () => {
            // Update after all have loaded, and on every subsequent update.
            if (keys.every((key) => store[key] !== undefined)) {
              forceUpdate()
            }
          },
        ] as const
    )
    for (const [id, listener] of listeners) {
      storeListeners[id].push(listener)
    }
    return () => {
      for (const [id, listener] of listeners) {
        storeListeners[id] = storeListeners[id].filter((l) => l !== listener)
      }
    }
  }, [keys, forceUpdate, listener])

  return keys.map((key) => store[key] as T | undefined)
}
