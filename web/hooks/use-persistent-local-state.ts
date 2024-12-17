import { safeJsonParse } from 'common/util/json'
import { useEffect, useState } from 'react'
import { safeLocalStorage } from 'web/lib/util/local'
import { isFunction } from 'web/hooks/use-persistent-in-memory-state'
import { useEvent } from 'web/hooks/use-event'
import { useIsClient } from 'web/hooks/use-is-client'

export const usePersistentLocalState = <T>(initialValue: T, key: string) => {
  const isClient = useIsClient()
  const [state, setState] = useState<T>(
    (isClient && safeJsonParse(safeLocalStorage?.getItem(key))) || initialValue
  )
  const [ready, setReady] = useState(false)
  const saveState = useEvent((newState: T | ((prevState: T) => T)) => {
    setState((prevState: T) => {
      const updatedState = isFunction(newState) ? newState(prevState) : newState
      setPersistentLocalState(key, updatedState)
      return updatedState
    })
  })

  useEffect(() => {
    // Set initial state.
    if (safeLocalStorage) {
      const storedJson = getPersistentLocalState(key)
      const storedValue = storedJson == null ? initialValue : storedJson
      setState(storedValue as T)
      setReady(true)
    }
  }, [key])

  return [state, saveState, ready] as const
}

export const getPersistentLocalState = (key: string) => {
  if (safeLocalStorage) {
    return safeJsonParse(safeLocalStorage.getItem(key))
  } else {
    return null
  }
}

export const setPersistentLocalState = <T>(key: string, value: T) => {
  safeLocalStorage?.setItem(key, JSON.stringify(value))
}
