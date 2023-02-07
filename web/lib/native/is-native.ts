import { safeLocalStorage, safeSessionStorage } from 'web/lib/util/local'
import { PrivateUser } from 'common/user'
import { updatePrivateUser } from 'web/lib/firebase/users'
import { uniq } from 'lodash'

const IS_NATIVE_KEY = 'is-native'
const PLATFORM_KEY = 'native-platform'

export const getIsNative = () => {
  const { isNative } = getNativeInfo()
  return isNative
}

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

export const setIsNative = (isNative: boolean, platform: string) => {
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
  updatePrivateUser(privateUser.id, {
    installedAppPlatforms: uniq([
      ...(privateUser.installedAppPlatforms ?? []),
      platform,
    ]),
  })
}
