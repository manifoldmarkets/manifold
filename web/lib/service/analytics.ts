import * as Sprig from 'web/lib/service/sprig'
import * as amplitude from '@amplitude/analytics-browser'

import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { db } from 'web/lib/supabase/db'
import { removeUndefinedProps } from 'common/util/object'
import { getIsNative } from '../native/is-native'
import { ShareEvent } from 'common/events'
import { api, completeQuest } from 'web/lib/firebase/api'
import { QuestType } from 'common/quest'
import { run, SupabaseClient } from 'common/supabase/utils'
import { Json } from 'common/supabase/schema'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'

amplitude.init(ENV_CONFIG.amplitudeApiKey, undefined)

type EventIds = {
  contractId?: string | null
  commentId?: string | null
  adId?: string | null
}

type EventData = Record<string, Json | undefined>

export async function track(name: string, properties?: EventIds & EventData) {
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
      console.log(name, userId, allProperties)
      await insertUserEvent(name, data, db, userId, contractId, commentId, adId)
      return
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

export function identifyUser(userId: string | null) {
  if (userId) {
    Sprig.setUserId(userId)
    amplitude.setUserId(userId)
  } else {
    amplitude.setUserId(null as any)
  }
}

export async function setUserProperty(property: string, value: string) {
  Sprig.setAttributes({ [property]: value })
  const identifyObj = new amplitude.Identify()
  identifyObj.set(property, value)
  await amplitude.identify(identifyObj).promise
}

export async function setOnceUserProperty(property: string, value: string) {
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

function insertUserEvent(
  name: string,
  data: EventData,
  db: SupabaseClient,
  userId?: string | null,
  contractId?: string | null,
  commentId?: string | null,
  adId?: string | null
) {
  console.log(
    'insertUserEvent',
    name,
    data,
    userId,
    contractId,
    commentId,
    adId
  )
  if ((name === 'view market' || name === 'view market card') && contractId) {
    const kind = !!data?.isPromoted
      ? 'promoted'
      : name === 'view market'
      ? 'page'
      : 'card'
    if (userId == null) {
      return api('record-contract-view', { contractId, kind })
    } else {
      return api('record-contract-view', { userId, contractId, kind })
    }
  } else if (
    (name === 'click market card feed' ||
      name === 'bet' ||
      name === 'comment' ||
      name === 'repost') &&
    contractId
  ) {
    const feedItem = data?.feedItem as FeedTimelineItem | undefined
    const isCardClick = name === 'click market card feed'
    const kind =
      name === 'comment'
        ? 'page comment'
        : name === 'repost'
        ? 'page repost'
        : !!data?.isPromoted && isCardClick
        ? 'promoted click'
        : isCardClick
        ? 'card click'
        : data?.location === 'feed card' ||
          data?.location === 'feed' ||
          !!feedItem
        ? 'card bet'
        : 'page bet'
    if (userId !== null) {
      return api(
        'record-contract-interaction',
        removeUndefinedProps({
          contractId,
          commentId: commentId ?? feedItem?.commentId ?? undefined,
          kind,
          feedType: feedItem?.dataType,
          feedReasons: feedItem?.reasons,
          betGroupId: data?.betGroupId as string,
          betId: data?.betId as string,
        })
      )
    }
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
