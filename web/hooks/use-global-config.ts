import { GlobalConfig } from 'common/globalConfig'
import { useEffect, useState } from 'react'
import { listenForGlobalConfig } from 'web/lib/firebase/globalConfig'

export const useGlobalConfig = () => {
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(null)

  useEffect(() => {
    listenForGlobalConfig(setGlobalConfig)
  }, [])
  return globalConfig
}
