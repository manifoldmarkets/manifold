import { collection, orderBy, query, where } from 'firebase/firestore'
import { Notification } from 'common/notification'
import { db } from 'web/lib/firebase/init'
import { listenForValues } from 'web/lib/firebase/utils'

export function getNotificationsQuery(userId: string, unseenOnly?: boolean) {
  const notifsCollection = collection(db, `/users/${userId}/notifications`)
  if (unseenOnly)
    return query(
      notifsCollection,
      where('isSeen', '==', false),
      orderBy('createdTime', 'desc')
    )
  return query(notifsCollection, orderBy('createdTime', 'desc'))
}

export function listenForNotifications(
  userId: string,
  setNotifications: (notifs: Notification[]) => void,
  unseenOnly?: boolean
) {
  return listenForValues<Notification>(
    getNotificationsQuery(userId, unseenOnly),
    (notifs) => {
      notifs.sort((n1, n2) => n2.createdTime - n1.createdTime)
      setNotifications(notifs)
    },
    true
  )
}
