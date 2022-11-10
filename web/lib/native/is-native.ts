import { safeLocalStorage } from 'web/lib/util/local'

const IS_NATIVE_KEY = 'is-native'
const PLATFORM_KEY = 'native-platform'

export const getIsNative = () => {
  if (typeof window === 'undefined') return false
  const local = safeLocalStorage()
  const isNative = local?.getItem(IS_NATIVE_KEY)
  return isNative === 'true'
}

export const getNativePlatform = () => {
  if (typeof window === 'undefined') return { isNative: false, platform: '' }
  const local = safeLocalStorage()
  const isNative = local?.getItem(IS_NATIVE_KEY)
  const platform = local?.getItem(PLATFORM_KEY)
  return { isNative: isNative === 'true', platform }
}

export const setIsNative = (isNative: boolean, platform: string) => {
  const local = safeLocalStorage()
  local?.setItem(IS_NATIVE_KEY, isNative ? 'true' : 'false')
  if (platform) {
    local?.setItem(PLATFORM_KEY, platform)
  }
}
