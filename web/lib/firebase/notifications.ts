import { collection, query, where } from 'firebase/firestore'
import { Notification } from 'common/notification'
import { db } from 'web/lib/firebase/init'
import { listenForValues } from 'web/lib/firebase/utils'

const notificationsCollection = collection(db, 'notifications')

function getNotificationsCollection(userId: string) {
  return query(notificationsCollection, where('userId', '==', userId))
}

export function listenForNotifications(
  userId: string,
  setNotifications: (notifs: Notification[]) => void
) {
  return listenForValues<Notification>(
    getNotificationsCollection(userId),
    (notifs) => {
      notifs.sort((n1, n2) => n1.createdTime - n2.createdTime)
      setNotifications(notifs)
    }
  )
}
