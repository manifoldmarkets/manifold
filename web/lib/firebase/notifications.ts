import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { NOTIFICATIONS_PER_PAGE } from 'web/pages/notifications'
import { Notification, notification_source_types } from 'common/notification'
import { groupPath } from 'web/lib/firebase/groups'

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
