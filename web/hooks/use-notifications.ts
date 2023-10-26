import {
  BalanceChangeNotificationTypes,
  Notification,
  notification_source_types,
  NotificationReason,
} from 'common/notification'
import { Dictionary, first, groupBy, sortBy } from 'lodash'
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

function useNotifications(
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

function useUnseenNotifications(
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

export function useGroupedUnseenNotifications(
  userId: string,
  selectTypes?: notification_source_types[]
) {
  const notifications = useUnseenNotifications(userId)?.filter(
    (n) => selectTypes?.includes(n.sourceType) ?? true
  )
  return useMemo(() => {
    return notifications ? groupNotificationsForIcon(notifications) : undefined
  }, [notifications])
}

export function useGroupedNotifications(
  userId: string,
  selectTypes?: notification_source_types[]
) {
  const notifications = useNotifications(userId)?.filter(
    (n) => selectTypes?.includes(n.sourceType) ?? true
  )
  const sortedNotifications = notifications
    ? sortBy(notifications, (n) => -n.createdTime)
    : undefined

  const [groupedNotifications, mostRecentNotification] =
    groupGeneralNotifications(sortedNotifications, [
      'loan_income',
      'contract_from_followed_user',
    ])

  const groupedBalanceChangeNotifications =
    groupBalanceChangeNotifications(sortedNotifications)
  const groupedNewMarketNotifications =
    groupNewMarketNotifications(sortedNotifications)

  return useMemo(
    () => ({
      mostRecentNotification,
      groupedNotifications,
      groupedBalanceChangeNotifications,
      groupedNewMarketNotifications,
    }),
    [notifications]
  )
}

const groupNotifications = (
  notifications: Dictionary<Notification[]>
): NotificationGroup[] => {
  return Object.entries(notifications).map(([key, value]) => ({
    notifications: value,
    groupedById: key,
    isSeen: value.every((n) => n.isSeen),
  }))
}

function groupNotificationsForIcon(notifications: Notification[]) {
  const sortedNotifications = sortBy(notifications, (n) => -n.createdTime)
  const notificationGroupsByDayOrDayAndContract = groupBy(
    sortedNotifications,
    (notification) =>
      notification.reason === 'contract_from_followed_user'
        ? new Date(notification.createdTime).toDateString()
        : new Date(notification.createdTime).toDateString() +
          notification.sourceContractId +
          notification.sourceTitle
  )

  return groupNotifications(notificationGroupsByDayOrDayAndContract)
}

function groupGeneralNotifications(
  sortedNotifications: Notification[] | undefined,
  except: NotificationReason[]
) {
  if (!sortedNotifications) return []

  const groupedNotificationsByDayAndContract = groupBy(
    sortedNotifications.filter((n) => !except.includes(n.reason)),
    (n) =>
      new Date(n.createdTime).toDateString() +
      (n.sourceType === 'betting_streak_bonus' || n.reason === 'quest_payout'
        ? 'quest_payout'
        : `${n.sourceTitle}${n.sourceContractId}`)
  )
  const mostRecentNotification = first(sortedNotifications)
  const groupedNotifications = groupNotifications(
    groupedNotificationsByDayAndContract
  )

  return [groupedNotifications, mostRecentNotification] as const
}

function groupBalanceChangeNotifications(
  sortedNotifications: Notification[] | undefined
) {
  if (!sortedNotifications) return undefined
  const filteredNotifications = sortedNotifications.filter((n) =>
    BalanceChangeNotificationTypes.includes(n.reason)
  )
  const notificationGroupsByDayAndContract = groupBy(
    filteredNotifications,
    (notification) =>
      new Date(notification.createdTime).toDateString() +
      notification.sourceContractId +
      notification.sourceTitle
  )

  return groupNotifications(notificationGroupsByDayAndContract)
}

function groupNewMarketNotifications(
  sortedNotifications: Notification[] | undefined
) {
  if (!sortedNotifications) return undefined
  const filteredNotifications = sortedNotifications.filter(
    (n) => n.reason === 'contract_from_followed_user'
  )
  const notificationGroupsByDay = groupBy(
    filteredNotifications,
    (notification) =>
      new Date(notification.createdTime).toDateString() +
      notification.sourceUserUsername
  )

  return groupNotifications(notificationGroupsByDay)
}
