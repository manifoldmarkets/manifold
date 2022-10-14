import { GlobalConfig } from 'common/globalConfig'
import { useEffect } from 'react'
import { listenForGlobalConfig } from 'web/lib/firebase/globalConfig'
import { inMemoryStore, usePersistentState } from './use-persistent-state'

export const useGlobalConfig = () => {
  const [globalConfig, setGlobalConfig] =
    usePersistentState<GlobalConfig | null>(null, {
      store: inMemoryStore(),
      key: 'globalConfig',
    })

  useEffect(() => {
    return listenForGlobalConfig(setGlobalConfig)
  }, [setGlobalConfig])
  return globalConfig
}
