import { GlobalConfig } from 'common/globalConfig'
import { listenForGlobalConfig } from 'web/lib/firebase/globalConfig'
import { useStore } from './use-store'

export const useGlobalConfig = () => {
  return useStore<GlobalConfig | null>('globalConfig', (_, setConfig) =>
    listenForGlobalConfig(setConfig)
  )
}
