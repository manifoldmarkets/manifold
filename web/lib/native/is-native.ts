import {
  IS_NATIVE_KEY,
  NATIVE_INFO_LOCAL_KEYS,
  PLATFORM_KEY,
} from 'common/native-message'
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

// The logout path clears localStorage wholesale, which also drops the native
// flags. The legacy is-native/native-platform pair mostly survives that anyway
// (getNativeInfo falls back to sessionStorage, and the WebView re-injects them
// on every page load), but the v2 keys behind useNativeInfo() live only in
// localStorage and are re-written only from a ?nativePlatform= query — which an
// in-app reload of a client-side route doesn't carry. Carry all of them across
// the clear so the page keeps rendering as native.
export const clearLocalStoragePreservingNativeInfo = () => {
  if (typeof window === 'undefined') return
  const { isNative, platform } = getNativeInfo()
  const preserved = NATIVE_INFO_LOCAL_KEYS.map(
    (key) => [key, safeLocalStorage?.getItem(key) ?? null] as const
  )
  localStorage.clear()
  if (isNative) setIsNativeOld(true, platform ?? '')
  preserved.forEach(([key, value]) => {
    if (value !== null) safeLocalStorage?.setItem(key, value)
  })
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
