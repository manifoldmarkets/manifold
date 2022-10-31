import {
  collection,
  deleteField,
  doc,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { NOTIFICATIONS_PER_PAGE } from 'web/pages/notifications'
import { Notification, notification_source_types } from 'common/notification'
import { groupPath } from 'web/lib/firebase/groups'
import {
  getPrivateUser,
  privateUsers,
  updatePrivateUser,
} from 'web/lib/firebase/users'
import { removeUndefinedProps } from 'common/util/object'
import { listenForValues } from './utils'
import { postMessageToNative } from 'web/components/native-message-listener'

export function getNotificationsQuery(
  userId: string,
  unseenOnlyOptions?: { unseenOnly: boolean; limit: number }
) {
  const notifsCollection = collection(db, `/users/${userId}/notifications`)
  if (unseenOnlyOptions?.unseenOnly)
    return query(
      notifsCollection,
      where('isSeen', '==', false),
      orderBy('createdTime', 'desc'),
      limit(unseenOnlyOptions.limit)
    )
  return query(
    notifsCollection,
    orderBy('createdTime', 'desc'),
    // Nobody's going through 10 pages of notifications, right?
    limit(NOTIFICATIONS_PER_PAGE * 10)
  )
}

export function getSourceIdForLinkComponent(
  sourceId: string,
  sourceType?: notification_source_types
) {
  switch (sourceType) {
    case 'answer':
      return `answer-${sourceId}`
    case 'comment':
      return sourceId
    case 'contract':
      return ''
    case 'bet':
      return ''
    default:
      return sourceId
  }
}

export function getSourceUrl(notification: Notification) {
  const {
    sourceType,
    sourceId,
    sourceUserUsername,
    sourceContractCreatorUsername,
    sourceContractSlug,
    sourceSlug,
  } = notification
  if (sourceType === 'follow') return `/${sourceUserUsername}`
  if (sourceType === 'group' && sourceSlug) return `${groupPath(sourceSlug)}`
  // User referral via contract:
  if (
    sourceContractCreatorUsername &&
    sourceContractSlug &&
    sourceType === 'user'
  )
    return `/${sourceContractCreatorUsername}/${sourceContractSlug}`
  // User referral:
  if (sourceType === 'user' && !sourceContractSlug)
    return `/${sourceUserUsername}`
  if (sourceType === 'challenge') return `${sourceSlug}`
  if (sourceContractCreatorUsername && sourceContractSlug)
    return `/${sourceContractCreatorUsername}/${sourceContractSlug}#${getSourceIdForLinkComponent(
      sourceId ?? '',
      sourceType
    )}`
  else if (sourceSlug)
    return `${
      sourceSlug.startsWith('/') ? sourceSlug : '/' + sourceSlug
    }#${getSourceIdForLinkComponent(sourceId ?? '', sourceType)}`

  return ''
}

export const setPushToken = async (userId: string, pushToken: string) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  console.log('setting push token' + pushToken + 'for user' + privateUser.id)
  try {
    const prefs = privateUser.notificationPreferences
    prefs.opt_out_all = prefs.opt_out_all.filter((p) => p !== 'mobile')
    await updateDoc(
      doc(privateUsers, privateUser.id),
      removeUndefinedProps({
        ...privateUser,
        notificationPreferences: prefs,
        pushToken,
        rejectedPushNotificationsOn: privateUser.rejectedPushNotificationsOn
          ? deleteField()
          : undefined,
        interestedInPushNotifications: privateUser.interestedInPushNotifications
          ? deleteField()
          : undefined,
      })
    )
  } catch (e) {
    console.error('error setting user push token', e)
    postMessageToNative('error', 'Error setting push token')
  }
}

export const handlePushNotificationPermissionStatus = async (
  userId: string,
  status: 'denied' | 'undetermined'
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser || privateUser.pushToken) return
  if (status === 'denied') {
    await setPushTokenRequestDenied(privateUser.id)
  }
}

export const setPushTokenRequestDenied = async (userId: string) => {
  console.log('push token denied', userId)
  // TODO: at some point in the future we can ask them again
  await updatePrivateUser(userId, {
    rejectedPushNotificationsOn: Date.now(),
    interestedInPushNotifications: false,
  })
}

export function listenForNotifications(
  userId: string,
  setNotifictions: (notifications: Notification[]) => void
) {
  return listenForValues<Notification>(
    getNotificationsQuery(userId),
    setNotifictions
  )
}
