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
  listenForValue: (key: string, setValue: (value: T) => void) => void,
  options: {
    prefix?: string
  } = {}
) => {
  const { prefix = '' } = options
  const keyWithPrefix = prefix + key

  const forceUpdate = useForceUpdate()
  const listener = useEvent(listenForValue)

  useEffect(() => {
    if (key === undefined) return

    if (!storeListeners[keyWithPrefix]) {
      storeListeners[keyWithPrefix] = []
      listener(key, (value) => updateValue(keyWithPrefix, value))
    }

    storeListeners[keyWithPrefix].push(forceUpdate)

    return () => {
      storeListeners[keyWithPrefix] = storeListeners[keyWithPrefix].filter(
        (l) => l !== forceUpdate
      )
    }
  }, [key, keyWithPrefix, forceUpdate, listener])

  if (key === undefined) return undefined

  return store[keyWithPrefix] as T | undefined
}

export const useStoreItems = <T>(
  keys: string[],
  listenForValue: (key: string, setValue: (value: T) => void) => void,
  options: {
    prefix?: string
  } = {}
) => {
  const { prefix = '' } = options

  const forceUpdate = useForceUpdate()
  const listener = useEvent(listenForValue)

  useEffectCheckEquality(() => {
    for (const key of keys) {
      const keyWithPrefix = prefix + key
      if (!storeListeners[keyWithPrefix]) {
        storeListeners[keyWithPrefix] = []
        listener(key, (value) => updateValue(keyWithPrefix, value))
      }
    }

    const listeners = keys.map(
      (key) =>
        [
          key,
          () => {
            // Update after all have loaded, and on every subsequent update.
            if (keys.every((key) => store[prefix + key] !== undefined)) {
              forceUpdate()
            }
          },
        ] as const
    )
    for (const [key, listener] of listeners) {
      const keyWithPrefix = prefix + key
      storeListeners[keyWithPrefix].push(listener)
    }
    return () => {
      for (const [key, listener] of listeners) {
        const keyWithPrefix = prefix + key
        storeListeners[keyWithPrefix] = storeListeners[keyWithPrefix].filter(
          (l) => l !== listener
        )
      }
    }
  }, [keys, forceUpdate, listener])

  return keys.map((key) => store[prefix + key] as T | undefined)
}
