import { safeJsonParse } from 'common/util/json'
import { useEffect } from 'react'
import { safeLocalStorage } from 'web/lib/util/local'
import { isFunction } from 'web/hooks/use-persistent-in-memory-state'
import { useStateCheckEquality } from 'web/hooks/use-state-check-equality'
import { useEvent } from 'web/hooks/use-event'
import { useIsClient } from 'web/hooks/use-is-client'

export const usePersistentLocalState = <T>(initialValue: T, key: string) => {
  const isClient = useIsClient()
  const [state, setState] = useStateCheckEquality<T>(
    (isClient && safeJsonParse(safeLocalStorage?.getItem(key))) || initialValue
  )
  const saveState = useEvent((newState: T | ((prevState: T) => T)) => {
    setState((prevState: T) => {
      const updatedState = isFunction(newState) ? newState(prevState) : newState
      safeLocalStorage?.setItem(key, JSON.stringify(updatedState))
      return updatedState
    })
  })

  useEffect(() => {
    if (safeLocalStorage) {
      const storedJson = safeJsonParse(safeLocalStorage.getItem(key))
      const storedValue = storedJson ?? initialValue
      saveState(storedValue as T)
    }
  }, [key])

  return [state, saveState] as const
}
