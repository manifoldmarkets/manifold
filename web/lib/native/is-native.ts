import { safeLocalStorage } from 'web/lib/util/local'

export const IS_NATIVE_KEY = 'is-native'
export const getIsNative = () => {
  if (typeof window === 'undefined') return false
  const local = safeLocalStorage()
  const isNative = local?.getItem(IS_NATIVE_KEY)
  return isNative === 'true'
}
export const setIsNative = (isNative: boolean) => {
  const local = safeLocalStorage()
  local?.setItem(IS_NATIVE_KEY, isNative ? 'true' : 'false')
}
