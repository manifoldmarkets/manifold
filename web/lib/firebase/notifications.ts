import { collection, query, where } from 'firebase/firestore'
import { Notification } from 'common/notification'
import { db } from 'web/lib/firebase/init'
import { getValues, listenForValues } from 'web/lib/firebase/utils'

function getNotificationsCollection(userId: string, unseenOnly?: boolean) {
  const notifsCollection = collection(db, `/users/${userId}/notifications`)
  if (unseenOnly) return query(notifsCollection, where('isSeen', '==', false))
  return query(notifsCollection)
}

export function getUnseenNotifications(userId: string) {
  return getValues<Notification>(getNotificationsCollection(userId, true))
}

export function listenForNotifications(
  userId: string,
  setNotifications: (notifs: Notification[]) => void
) {
  return listenForValues<Notification>(
    getNotificationsCollection(userId),
    (notifs) => {
      notifs.sort((n1, n2) => n2.createdTime - n1.createdTime)
      setNotifications(notifs)
    }
  )
}
