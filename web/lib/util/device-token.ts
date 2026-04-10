import { randomString } from 'common/util/random'

import { safeLocalStorage } from './local'

export const ensureDeviceToken = () => {
  let deviceToken = safeLocalStorage?.getItem('device-token')
  if (!deviceToken) {
    deviceToken = randomString()
    safeLocalStorage?.setItem('device-token', deviceToken)
  }
  return deviceToken
}
