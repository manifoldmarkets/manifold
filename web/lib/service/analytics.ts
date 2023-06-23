import * as Sprig from 'web/lib/service/sprig'

import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { run } from 'common/supabase/utils'
import { Json } from 'common/supabase/schema'
import { db } from 'web/lib/supabase/db'
import { removeUndefinedProps } from 'common/util/object'
import { getIsNative } from '../native/is-native'
import { ShareEvent } from 'common/events'
import { completeQuest } from 'web/lib/firebase/api'
import { QuestType } from 'common/quest'

const loadAmplitude = () => import('@amplitude/analytics-browser')
let amplitudeLib: ReturnType<typeof loadAmplitude> | undefined

type EventIds = {
  contractId?: string | null
  commentId?: string | null
  adId?: string | null
}
type EventData = Record<string, Json | undefined>

export const initAmplitude = async () => {
  if (amplitudeLib == null) {
    const amplitude = await (amplitudeLib = loadAmplitude())
    amplitude.init(ENV_CONFIG.amplitudeApiKey, undefined)
    return amplitude
  } else {
    return await amplitudeLib
  }
}

async function insertSupabaseEvent(
  name: string,
  data: EventData,
  userId?: string | null,
  contractId?: string | null,
  commentId?: string | null,
  adId?: string | null
) {
  if (
    (name === 'view question' || name === 'view question card') &&
    userId &&
    contractId
  ) {
    return run(
      db.from('user_seen_questions').insert({
        user_id: userId,
        contract_id: contractId,
        data: removeUndefinedProps(data) as Record<string, Json>,
        type: name,
      })
    )
  }
  return run(
    db.from('user_events').insert({
      name,
      data: removeUndefinedProps(data) as Record<string, Json>,
      user_id: userId,
      contract_id: contractId,
      comment_id: commentId,
      ad_id: adId,
    })
  )
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

  if (ENV !== 'PROD') {
    console.log(name, allProperties)
  }
  try {
    const { contractId, adId, commentId, ...data } = allProperties
    await Promise.all([
      amplitude.track(name, removeUndefinedProps(allProperties)).promise,
      insertSupabaseEvent(name, data, userId, contractId, commentId, adId),
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
