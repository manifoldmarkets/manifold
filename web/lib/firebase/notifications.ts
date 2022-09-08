import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { NOTIFICATIONS_PER_PAGE } from 'web/pages/notifications'

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
