import { useEffect, useState } from 'react'

const store: { [key: string]: any } = {}

export const usePersistentInMemoryState = <T>(initialValue: T, key: string) => {
  const [state, setState] = useState<T>(initialValue)

  useEffect(() => {
    const storedJson = store.hasOwnProperty(key) ? JSON.parse(store[key]) : null
    const storedValue = storedJson ?? initialValue
    setState(storedValue as T)
  }, [key])

  const saveState = (newState: T) => {
    setState(newState)
    store[key] = JSON.stringify(newState)
  }

  return [state, saveState] as const
}
