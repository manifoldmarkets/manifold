import { Notification } from 'common/notification'
import { PrivateUser } from 'common/user'
import { groupBy, map, uniqBy } from 'lodash'
import { useEffect, useMemo } from 'react'
import {
  listenForNotifications,
  listenForUnseenNotifications,
} from 'web/lib/firebase/notifications'
import {
  inMemoryStore,
  storageStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'

export type NotificationGroup = {
  notifications: Notification[]
  groupedById: string
  isSeen: boolean
  timePeriod: string
}
const NOTIFICATIONS_KEY = 'notifications'
function useNotifications(privateUser: PrivateUser) {
  const [notifications, setNotifications] = usePersistentState<
    Notification[] | undefined
  >(undefined, {
    key: NOTIFICATIONS_KEY,
    store: storageStore(safeLocalStorage()),
  })
  useEffect(() => {
    listenForNotifications(privateUser.id, setNotifications)
  }, [privateUser.id, setNotifications])

  return notifications
}

function useUnseenNotifications(privateUser: PrivateUser) {
  const [unseenNotifications, setUnseenNotifications] = usePersistentState<
    Notification[] | undefined
  >(undefined, {
    key: 'unseen-notifications',
    store: inMemoryStore(),
  })
  // We also tack on the unseen notifications to the notifications state so that
  // when you navigate to the notifications page, you see the new ones immediately
  const [_, setNotifications] = usePersistentState<Notification[] | undefined>(
    undefined,
    {
      key: NOTIFICATIONS_KEY,
      store: storageStore(safeLocalStorage()),
    }
  )
  useEffect(() => {
    listenForUnseenNotifications(privateUser.id, (unseenNotifications) => {
      setUnseenNotifications(unseenNotifications)
      if (unseenNotifications.length > 0) {
        setNotifications((notifications) => {
          return uniqBy(
            [...(notifications ?? []), ...unseenNotifications],
            (n) => n.id
          )
        })
      }
    })
  }, [privateUser.id, setUnseenNotifications])
  return unseenNotifications
}

export function useGroupedNotifications(privateUser: PrivateUser) {
  const notifications = useNotifications(privateUser) ?? []
  return useMemo(() => {
    return groupNotifications(notifications)
  }, [notifications])
}

export function useGroupedUnseenNotifications(privateUser: PrivateUser) {
  const notifications = useUnseenNotifications(privateUser)
  return useMemo(() => {
    return notifications ? groupNotifications(notifications) : undefined
  }, [notifications])
}

function groupNotifications(notifications: Notification[]) {
  let notificationGroups: NotificationGroup[] = []
  const notificationGroupsByDay = groupBy(notifications, (notification) =>
    new Date(notification.createdTime).toDateString()
  )

  Object.keys(notificationGroupsByDay).forEach((day) => {
    const notificationsGroupedByDay = notificationGroupsByDay[day]
    // Group notifications by contract
    const groupedNotificationsByContractId = groupBy(
      notificationsGroupedByDay,
      (notification) => {
        return notification.sourceContractId
      }
    )
    notificationGroups = notificationGroups.concat(
      map(groupedNotificationsByContractId, (notifications, contractId) => {
        const notificationsForContractId = groupedNotificationsByContractId[
          contractId
        ].sort((a, b) => {
          return b.createdTime - a.createdTime
        })
        // Create a notification group for each contract within each day
        const notificationGroup: NotificationGroup = {
          notifications: notificationsForContractId,
          groupedById: contractId,
          isSeen: notificationsForContractId.some((n) => !n.isSeen),
          timePeriod: day,
        }
        return notificationGroup
      })
    )
  })
  return notificationGroups
}
