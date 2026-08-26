import { IS_NATIVE_KEY, PLATFORM_KEY } from 'common/native-message'
import { PrivateUser } from 'common/user'
import { uniq } from 'lodash'
import { safeLocalStorage, safeSessionStorage } from 'web/lib/util/local'
import { api } from '../api/api'

/**@deprecated, use useNativeInfo() instead */
export const getIsNative = () => {
  const { isNative } = getNativeInfo()
  return isNative
}

/**@deprecated, use useNativeInfo() instead */
export const getNativePlatform = () => {
  return getNativeInfo()
}

const getNativeInfo = () => {
  if (typeof window === 'undefined') return { isNative: false, platform: '' }
  const local = safeLocalStorage
  const ss = safeSessionStorage
  const isNative = local?.getItem(IS_NATIVE_KEY) || ss?.getItem(IS_NATIVE_KEY)
  const platform = local?.getItem(PLATFORM_KEY) || ss?.getItem(PLATFORM_KEY)
  return { isNative: isNative === 'true', platform }
}

// A bare localStorage.clear() on logout also drops the native flags, which the
// WebView only re-injects on a full page load. Until then getIsNative() reads
// false, so postMessageToNative() silently no-ops and firebaseLogin() falls
// through to signInWithPopup — which Google refuses to serve inside an Android
// WebView, leaving a login button that does nothing at all.
export const clearLocalStoragePreservingNativeInfo = () => {
  if (typeof window === 'undefined') return
  const { isNative, platform } = getNativeInfo()
  localStorage.clear()
  if (isNative) setIsNativeOld(true, platform ?? '')
}

export const setIsNativeOld = (isNative: boolean, platform: string) => {
  const local = safeLocalStorage
  const ss = safeSessionStorage
  local?.setItem(IS_NATIVE_KEY, isNative ? 'true' : 'false')
  ss?.setItem(IS_NATIVE_KEY, isNative ? 'true' : 'false')
  if (platform) {
    local?.setItem(PLATFORM_KEY, platform)
    ss?.setItem(PLATFORM_KEY, platform)
  }
}

export const setInstalledAppPlatform = (
  privateUser: PrivateUser,
  platform: string
) => {
  if (privateUser.installedAppPlatforms?.includes(platform)) return
  api('me/private/update', {
    installedAppPlatforms: uniq([
      ...(privateUser.installedAppPlatforms ?? []),
      platform,
    ]),
  })
}
