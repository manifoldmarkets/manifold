import { safeJsonParse } from 'common/util/json'
import { useEffect } from 'react'
import { useStateCheckEquality } from './use-state-check-equality'

const store: { [key: string]: any } = {}

export const usePersistentInMemoryState = <T>(initialValue: T, key: string) => {
  const [state, setState] = useStateCheckEquality<T>(
    safeJsonParse(store[key]) ?? initialValue
  )

  useEffect(() => {
    const storedValue = safeJsonParse(store[key]) ?? initialValue
    setState(storedValue as T)
  }, [key])

  const saveState = (newState: T) => {
    setState(newState)
    store[key] = JSON.stringify(newState)
  }

  return [state, saveState] as const
}
