import { safeJsonParse } from 'common/util/json'
import { useEffect, useState } from 'react'
import { useEvent } from 'web/hooks/use-event'

const store: { [key: string]: any } = {}
export function isFunction<T>(
  value: T | ((prevState: T) => T)
): value is (prevState: T) => T {
  return typeof value === 'function'
}
export const usePersistentInMemoryState = <T>(initialValue: T, key: string) => {
  const [state, setState] = useState<T>(
    safeJsonParse(store[key]) ?? initialValue
  )

  useEffect(() => {
    const storedValue = safeJsonParse(store[key]) ?? initialValue
    setState(storedValue as T)
  }, [key])

  const saveState = useEvent((newState: T | ((prevState: T) => T)) => {
    setState((prevState) => {
      const updatedState = isFunction(newState) ? newState(prevState) : newState
      store[key] = JSON.stringify(updatedState)
      return updatedState
    })
  })

  return [state, saveState] as const
}

export const removePersistentInMemoryState = (key: string) => {
  delete store[key]
}
