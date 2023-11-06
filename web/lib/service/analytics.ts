import * as Sprig from 'web/lib/service/sprig'

import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { db } from 'web/lib/supabase/db'
import { removeUndefinedProps } from 'common/util/object'
import { getIsNative } from '../native/is-native'
import { ShareEvent } from 'common/events'
import { completeQuest } from 'web/lib/firebase/api'
import { QuestType } from 'common/quest'
import { EventData, insertUserEvent } from 'common/supabase/analytics'

const loadAmplitude = () => import('@amplitude/analytics-browser')
let amplitudeLib: ReturnType<typeof loadAmplitude> | undefined

type EventIds = {
  contractId?: string | null
  commentId?: string | null
  adId?: string | null
}

export const initAmplitude = async () => {
  if (amplitudeLib == null) {
    const amplitude = await (amplitudeLib = loadAmplitude())
    amplitude.init(ENV_CONFIG.amplitudeApiKey, undefined)
    return amplitude
  } else {
    return await amplitudeLib
  }
}

export async function track(name: string, properties?: EventIds & EventData) {
  const amplitude = await initAmplitude()
  const deviceId = amplitude.getDeviceId()
  const sessionId = amplitude.getSessionId()
  const userId = amplitude.getUserId()
  const isNative = getIsNative()

  // mqp: did you know typescript can't type `const x = { a: b, ...c }` correctly?
  // see https://github.com/microsoft/TypeScript/issues/27273
  const allProperties = Object.assign(properties ?? {}, {
    isNative,
    deviceId,
    sessionId,
  })

  const { contractId, adId, commentId, ...data } = allProperties
  try {
    if (ENV !== 'PROD') {
      console.log(name, allProperties)
      await insertUserEvent(name, data, db, userId, contractId, commentId, adId)
    }
    await Promise.all([
      amplitude.track(name, removeUndefinedProps(allProperties)).promise,
      insertUserEvent(name, data, db, userId, contractId, commentId, adId),
    ])
  } catch (e) {
    console.log('error tracking event:', e)
  }
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
  await track(eventName, {
    ...shareEventData,
    ...eventProperties,
  })
  completeQuest({ questType: 'SHARES' as QuestType }).catch(() => {})
}
