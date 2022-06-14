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

export async function identifyUser(userId: string) {
  setUserId(userId)
}

export async function setUserProperty(property: string, value: string) {
  const identifyObj = new Identify()
  identifyObj.set(property, value)
  await identify(identifyObj)
}
