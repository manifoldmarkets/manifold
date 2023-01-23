import { APPLE_APP_URL, GOOGLE_PLAY_APP_URL } from 'common/envs/constants'
import { useEffect, useState } from 'react'
import { isIOS } from 'web/lib/util/device'

export const useAppStoreUrl = () => {
  const [appStoreUrl, setAppStoreUrl] = useState(APPLE_APP_URL)
  useEffect(() => {
    setAppStoreUrl(isIOS() ? APPLE_APP_URL : GOOGLE_PLAY_APP_URL)
  }, [])
  return appStoreUrl
}
