import {
  init,
  track,
  identify,
  setUserId,
  Identify,
} from '@amplitude/analytics-browser'

import * as Sprig from 'web/lib/service/sprig'

import { ENV_CONFIG } from 'common/envs/constants'

init(ENV_CONFIG.amplitudeApiKey ?? '', undefined, { includeReferrer: true })

export { track }

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
