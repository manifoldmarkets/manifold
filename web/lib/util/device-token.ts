import { randomString } from 'common/util/random'
import {
  BROWSE_BROWSER_KEY,
  DEVICE_HISTORY_KEY,
  readDeviceHistory,
} from 'common/browse-rollout'
import { safeJsonParse } from 'common/util/json'

import { safeLocalStorage } from './local'

export const ensureDeviceToken = () => {
  let deviceToken = safeLocalStorage?.getItem('device-token')
  const isNewDevice = !deviceToken
  if (!deviceToken) {
    deviceToken = randomString()
    safeLocalStorage?.setItem('device-token', deviceToken)
  }
  // Experiment identity is separate from the moderation/signup token, which
  // must still rotate at logout. Record first-seen on any page's first event.
  let browserId = safeLocalStorage?.getItem(BROWSE_BROWSER_KEY)
  const isNewBrowser = !browserId
  if (!browserId) {
    browserId = randomString()
    safeLocalStorage?.setItem(BROWSE_BROWSER_KEY, browserId)
  }
  if (
    safeLocalStorage &&
    !readDeviceHistory(
      safeJsonParse(safeLocalStorage.getItem(DEVICE_HISTORY_KEY)),
      browserId
    )
  ) {
    safeLocalStorage.setItem(
      DEVICE_HISTORY_KEY,
      JSON.stringify({
        browserId,
        firstSeenTime: isNewDevice && isNewBrowser ? Date.now() : null,
      })
    )
  }
  return deviceToken
}

export const getDeviceHistory = () => {
  if (!safeLocalStorage) return undefined
  ensureDeviceToken()
  return readDeviceHistory(
    safeJsonParse(safeLocalStorage.getItem(DEVICE_HISTORY_KEY)),
    safeLocalStorage.getItem(BROWSE_BROWSER_KEY) ?? ''
  )
}
