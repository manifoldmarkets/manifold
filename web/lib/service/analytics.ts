import {
  init,
  track,
  identify,
  setUserId,
  Identify,
} from '@amplitude/analytics-browser'

import { ENV_CONFIG } from 'common/envs/constants'

init(ENV_CONFIG.amplitudeApiKey ?? '', undefined, { includeReferrer: true })

export { track }

// convenience function
export const withTracking =
  (
    f: (() => void) | (() => Promise<void>),
    eventName: string,
    eventProperties?: any
  ) =>
  () =>
    Promise.all([f(), track(eventName, eventProperties).promise])

export async function identifyUser(userId: string) {
  setUserId(userId)
}

export async function setUserProperty(property: string, value: string) {
  const identifyObj = new Identify()
  identifyObj.set(property, value)
  await identify(identifyObj)
}
