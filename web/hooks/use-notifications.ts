import {
  BalanceChangeNotificationTypes,
  Notification,
  NotificationReason,
} from 'common/notification'
import { PrivateUser } from 'common/user'
import { first, groupBy, sortBy } from 'lodash'
import { useEffect, useMemo } from 'react'
import {
  listenForNotifications,
  listenForUnseenNotifications,
} from 'web/lib/firebase/notifications'

import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export type NotificationGroup = {
  notifications: Notification[]
  groupedById: string
  isSeen: boolean
}
const NOTIFICATIONS_KEY = 'notifications'
function useNotifications(privateUser: PrivateUser) {
  const [notifications, setNotifications] = usePersistentLocalState<
    Notification[] | undefined
  >(undefined, NOTIFICATIONS_KEY)
  useEffect(() => {
    listenForNotifications(privateUser.id, setNotifications)
  }, [privateUser.id, setNotifications])

  return notifications
}

function useUnseenNotifications(privateUser: PrivateUser) {
  const [unseenNotifications, setUnseenNotifications] =
    usePersistentInMemoryState<Notification[] | undefined>(
      undefined,
      'unseen-notifications'
    )
  // We also tack on the unseen notifications to the notifications state so that
  // when you navigate to the notifications page, you see the new ones immediately
  const [_, setNotifications] = usePersistentLocalState<
    Notification[] | undefined
  >(undefined, NOTIFICATIONS_KEY)

  useEffect(() => {
    listenForUnseenNotifications(privateUser.id, (unseenNotifications) => {
      setUnseenNotifications(unseenNotifications)
      if (unseenNotifications.length > 0) {
        setNotifications((notifications) => {
          return [
            ...unseenNotifications.filter(
              (n) => !notifications?.some((n2) => n2.id === n.id)
            ),
            ...(notifications ?? []),
          ]
        })
      }
    })
  }, [privateUser.id])
  return unseenNotifications
}

export function useGroupedNonBalanceChangeNotifications(
  privateUser: PrivateUser
) {
  const notifications = useNotifications(privateUser) ?? []
  const balanceChangeOnlyReasons: NotificationReason[] = ['loan_income']
  return useMemo(() => {
    const groupedNotifications = groupNotifications(
      notifications.filter((n) => !balanceChangeOnlyReasons.includes(n.reason))
    )
    const mostRecentNotification = first(notifications)
    return {
      groupedNotifications,
      mostRecentNotification,
    }
  }, [notifications])
}

export function useGroupedBalanceChangeNotifications(privateUser: PrivateUser) {
  const notifications = useNotifications(privateUser) ?? []
  return useMemo(() => {
    return groupBalanceChangeNotifications(notifications)
  }, [notifications])
}

export function useGroupedUnseenNotifications(privateUser: PrivateUser) {
  const notifications = useUnseenNotifications(privateUser)
  return useMemo(() => {
    return notifications ? groupNotifications(notifications) : undefined
  }, [notifications])
}

function groupNotifications(notifications: Notification[]) {
  const sortedNotifications = sortBy(notifications, (n) => -n.createdTime)
  const notificationGroupsByDayAndContract = groupBy(
    sortedNotifications,
    (notification) =>
      new Date(notification.createdTime).toDateString() +
      notification.sourceContractId +
      notification.sourceTitle
  )

  return Object.entries(notificationGroupsByDayAndContract).map(
    ([key, value]) => ({
      notifications: value,
      groupedById: key,
      isSeen: value.some((n) => !n.isSeen),
    })
  )
}

function groupBalanceChangeNotifications(notifications: Notification[]) {
  const sortedNotifications = sortBy(
    notifications,
    (n) => -n.createdTime
  ).filter((n) => BalanceChangeNotificationTypes.includes(n.reason))
  const notificationGroupsByDayAndContract = groupBy(
    sortedNotifications,
    (notification) =>
      new Date(notification.createdTime).toDateString() +
      notification.sourceContractId +
      notification.sourceTitle
  )

  return Object.entries(notificationGroupsByDayAndContract).map(
    ([key, value]) => ({
      notifications: value,
      groupedById: key,
      isSeen: value.some((n) => !n.isSeen),
    })
  )
}
