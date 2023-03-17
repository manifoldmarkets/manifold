import * as Sprig from 'web/lib/service/sprig'

import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { saveUserEvent } from '../firebase/users'
import { removeUndefinedProps } from 'common/util/object'
import { getIsNative } from '../native/is-native'
import { ShareEvent } from 'common/events'
import { completeQuest } from 'web/lib/firebase/api'
import { QuestType } from 'common/quest'

const loadAmplitude = () => import('@amplitude/analytics-browser')
let amplitudeLib: ReturnType<typeof loadAmplitude> | undefined

const initAmplitude = async () => {
  if (amplitudeLib == null) {
    const amplitude = await (amplitudeLib = loadAmplitude())
    amplitude.init(ENV_CONFIG.amplitudeApiKey ?? '', undefined, {
      includeReferrer: true,
    })
    return amplitude
  } else {
    return await amplitudeLib
  }
}

export async function track(eventName: string, eventProperties?: any) {
  const amplitude = await initAmplitude()
  const deviceId = amplitude.getDeviceId()
  const sessionId = amplitude.getSessionId()
  const userId = amplitude.getUserId()
  const isNative = getIsNative()
  const props = removeUndefinedProps({
    isNative,
    deviceId,
    sessionId,
    ...eventProperties,
  })

  if (ENV !== 'PROD') {
    if (eventProperties) console.log(eventName, eventProperties)
    else console.log(eventName)
  }

  await Promise.all([
    amplitude.track(eventName, eventProperties).promise,
    saveUserEvent(userId, eventName, props),
  ])
  return { userId }
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

export async function identifyUser(userId: string | null) {
  const amplitude = await initAmplitude()
  if (userId) {
    Sprig.setUserId(userId)
    amplitude.setUserId(userId)
  } else {
    amplitude.setUserId(null as any)
  }
}

export async function setUserProperty(property: string, value: string) {
  Sprig.setAttributes({ [property]: value })
  const amplitude = await initAmplitude()
  const identifyObj = new amplitude.Identify()
  identifyObj.set(property, value)
  await amplitude.identify(identifyObj).promise
}

export async function setOnceUserProperty(property: string, value: string) {
  const amplitude = await initAmplitude()
  const identifyObj = new amplitude.Identify()
  identifyObj.setOnce(property, value)
  await amplitude.identify(identifyObj).promise
}

export async function trackShareEvent(
  eventName: string,
  url: string,
  eventProperties?: any
) {
  const shareEventData: Omit<ShareEvent, 'timestamp' | 'name'> = {
    url,
    type: 'copy sharing link',
  }
  const { userId } = await track(eventName, {
    ...shareEventData,
    ...eventProperties,
  })
  if (userId)
    completeQuest({ questType: 'SHARES' as QuestType, userId }).catch(() => {})
}
