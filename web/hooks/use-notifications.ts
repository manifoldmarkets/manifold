import {
  BalanceChangeNotificationTypes,
  Notification,
  NotificationReason,
} from 'common/notification'
import { first, groupBy, sortBy } from 'lodash'
import { useEffect, useMemo } from 'react'
import { NOTIFICATIONS_PER_PAGE } from 'web/components/notifications/notification-helpers'
import {
  useSubscription,
  usePersistentSubscription,
} from 'web/lib/supabase/realtime/use-subscription'
import {
  getNotifications,
  getUnseenNotifications,
} from 'common/supabase/notifications'
import { safeLocalStorage } from 'web/lib/util/local'
import { Row } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export type NotificationGroup = {
  notifications: Notification[]
  groupedById: string
  isSeen: boolean
}

const NOTIFICATIONS_KEY = 'notifications_1'

export function useNotifications(
  userId: string,
  // Nobody's going through 10 pages of notifications, right?
  count = 10 * NOTIFICATIONS_PER_PAGE
) {
  const { rows } = usePersistentSubscription(
    NOTIFICATIONS_KEY,
    'user_notifications',
    safeLocalStorage,
    { k: 'user_id', v: userId },
    () => getNotifications(db, userId, count)
  )
  return useMemo(() => rows?.map((r) => r.data as Notification), [rows])
}

export function useUnseenNotifications(
  userId: string,
  count = 10 * NOTIFICATIONS_PER_PAGE
) {
  const { status, rows } = useSubscription(
    'user_notifications',
    { k: 'user_id', v: userId },
    () => getUnseenNotifications(db, userId, count)
  )

  // hack: we tack the unseen notifications we got onto the end of the persisted
  // notifications state so that when you navigate to the notifications page,
  // you see the new ones immediately

  useEffect(() => {
    if (status === 'live' && rows != null) {
      const json = safeLocalStorage?.getItem(NOTIFICATIONS_KEY)
      const existing = json != null ? JSON.parse(json) : []
      const newNotifications =
        rows?.filter(
          (n) =>
            !existing.some(
              (n2: Row<'user_notifications'>) =>
                n2.notification_id === n.notification_id
            )
        ) ?? []
      safeLocalStorage?.setItem(
        NOTIFICATIONS_KEY,
        JSON.stringify([...newNotifications, ...existing])
      )
    }
  }, [status, rows])

  return useMemo(() => {
    return rows?.map((r) => r.data as Notification).filter((r) => !r.isSeen)
  }, [rows])
}

export function useGroupedNonBalanceChangeNotifications(userId: string) {
  const notifications = useNotifications(userId)

  const balanceChangeOnlyReasons: NotificationReason[] = ['loan_income']
  return useMemo(() => {
    const sortedNotifications =
      notifications != null
        ? sortBy(notifications, (n) => -n.createdTime)
        : undefined
    const groupedNotifications = sortedNotifications
      ? groupNotifications(
          sortedNotifications.filter(
            (n) => !balanceChangeOnlyReasons.includes(n.reason)
          )
        )
      : undefined
    const mostRecentNotification = first(sortedNotifications)
    return {
      groupedNotifications,
      mostRecentNotification,
    }
  }, [notifications])
}

export function useGroupedBalanceChangeNotifications(userId: string) {
  const notifications = useNotifications(userId)
  return useMemo(() => {
    if (!notifications) return undefined
    return groupBalanceChangeNotifications(notifications)
  }, [notifications])
}

export function useGroupedUnseenNotifications(userId: string) {
  const notifications = useUnseenNotifications(userId)
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
