import { randomString } from 'common/util/random'
import { DEVICE_HISTORY_KEY, readDeviceHistory } from 'common/browse-rollout'
import { safeJsonParse } from 'common/util/json'

import { safeLocalStorage } from './local'

export const ensureDeviceToken = () => {
  let deviceToken = safeLocalStorage?.getItem('device-token')
  const isNewDevice = !deviceToken
  if (!deviceToken) {
    deviceToken = randomString()
    safeLocalStorage?.setItem('device-token', deviceToken)
  }
  // Record this when the token is first created, on any page, before another
  // analytics caller can make a first-time visitor look like a returning one.
  if (
    safeLocalStorage &&
    !readDeviceHistory(
      safeJsonParse(safeLocalStorage.getItem(DEVICE_HISTORY_KEY)),
      deviceToken
    )
  ) {
    safeLocalStorage.setItem(
      DEVICE_HISTORY_KEY,
      JSON.stringify({
        deviceId: deviceToken,
        firstSeenTime: isNewDevice ? Date.now() : null,
      })
    )
  }
  return deviceToken
}

export const getDeviceHistory = () => {
  if (!safeLocalStorage) return undefined
  const deviceId = ensureDeviceToken()
  return readDeviceHistory(
    safeJsonParse(safeLocalStorage.getItem(DEVICE_HISTORY_KEY)),
    deviceId
  )
}
