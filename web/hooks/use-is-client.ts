import { useEffect } from 'react'
import { inMemoryStore, usePersistentState } from './use-persistent-state'

export const useIsClient = () => {
  const [isClient, setIsClient] = usePersistentState(false, {
    key: 'is-client',
    store: inMemoryStore(),
  })
  useEffect(() => setIsClient(true), [setIsClient])
  return isClient
}
