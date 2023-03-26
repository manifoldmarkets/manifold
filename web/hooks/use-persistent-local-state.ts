import { safeJsonParse } from 'common/util/json'
import { useEffect, useState } from 'react'
import { safeLocalStorage } from 'web/lib/util/local'

export const usePersistentLocalState = <T>(initialValue: T, key: string) => {
  const [state, setState] = useState<T>(initialValue)

  useEffect(() => {
    const storedJson = safeJsonParse(safeLocalStorage?.getItem(key))
    const storedValue = storedJson ?? initialValue
    setState(storedValue as T)
  }, [key])

  const saveState = (newState: T) => {
    setState(newState)
    safeLocalStorage?.setItem(key, JSON.stringify(newState))
  }

  return [state, saveState] as const
}
