import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { Notification } from 'common/notification'
import { db } from 'web/lib/firebase/init'
import { listenForValues } from 'web/lib/firebase/utils'
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

export function listenForNotifications(
  userId: string,
  setNotifications: (notifs: Notification[]) => void,
  unseenOnly?: boolean
) {
  return listenForValues<Notification>(
    getNotificationsQuery(
      userId,
      unseenOnly ? { unseenOnly, limit: NOTIFICATIONS_PER_PAGE } : undefined
    ),
    (notifs) => {
      notifs.sort((n1, n2) => n2.createdTime - n1.createdTime)
      setNotifications(notifs)
    }
  )
}
