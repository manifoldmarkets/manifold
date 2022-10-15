import {
  init,
  track as amplitudeTrack,
  identify,
  setUserId,
  getUserId,
  getDeviceId,
  getSessionId,
  Identify,
} from '@amplitude/analytics-browser'

import * as Sprig from 'web/lib/service/sprig'

import { ENV_CONFIG } from 'common/envs/constants'
import { saveUserEvent } from '../firebase/users'
import { removeUndefinedProps } from 'common/util/object'

init(ENV_CONFIG.amplitudeApiKey ?? '', undefined, { includeReferrer: true })

export function track(eventName: string, eventProperties?: any) {
  amplitudeTrack(eventName, eventProperties)

  const deviceId = getDeviceId()
  const sessionId = getSessionId()
  const props = removeUndefinedProps({
    ...eventProperties,
    deviceId,
    sessionId,
  })

  const userId = getUserId()
  saveUserEvent(userId, eventName, props)
}

// Convenience functions:

export const trackCallback =
  (eventName: string, eventProperties?: any) => () => {
    track(eventName, eventProperties)
  }

export const withTracking =
  (
    f: (() => void) | (() => Promise<void>),
    eventName: string,
    eventProperties?: any
  ) =>
  async () => {
    const promise = f()
    track(eventName, eventProperties)
    await promise
  }

export async function identifyUser(userId: string) {
  setUserId(userId)
  Sprig.setUserId(userId)
}

export async function setUserProperty(property: string, value: string) {
  const identifyObj = new Identify()
  identifyObj.set(property, value)
  await identify(identifyObj)
  Sprig.setAttributes({ [property]: value })
}
