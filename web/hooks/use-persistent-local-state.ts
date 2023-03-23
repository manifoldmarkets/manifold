import { useEffect, useState } from 'react'
import { safeLocalStorage } from 'web/lib/util/local'

export const usePersistentLocalState = <T>(initialValue: T, key: string) => {
  const [state, setState] = useState<T>(initialValue)

  useEffect(() => {
    const storedJson = JSON.parse(safeLocalStorage?.getItem(key) ?? 'null')
    const storedValue = storedJson ?? initialValue
    setState(storedValue as T)
  }, [key])

  const saveState = (newState: T) => {
    setState(newState)
    safeLocalStorage?.setItem(key, JSON.stringify(newState))
  }

  return [state, saveState] as const
}
