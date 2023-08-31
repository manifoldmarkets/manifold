import { getNativePlatform } from 'web/lib/native/is-native'

export const linkClass =
  'break-anywhere hover:underline hover:decoration-primary-400 hover:decoration-2'

export const getLinkTarget = (href: string, newTab?: boolean) => {
  if (href.startsWith('http')) return '_blank'
  const { isNative, platform } = getNativePlatform()
  // Native android will open 'a new tab' in the system browser rather than in the app
  if (isNative && platform === 'android') return '_self'
  return newTab ? '_blank' : '_self'
}
