import { useEffect, useMemo, useState } from 'react'
import { notification_subscribe_types, PrivateUser } from 'common/user'
import { Notification } from 'common/notification'
import {
  getNotificationsQuery,
  listenForNotifications,
} from 'web/lib/firebase/notifications'
import { groupBy, map } from 'lodash'
import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { NOTIFICATIONS_PER_PAGE } from 'web/pages/notifications'

export type NotificationGroup = {
  notifications: Notification[]
  groupedById: string
  isSeen: boolean
  timePeriod: string
  type: 'income' | 'normal'
}

// For some reason react-query subscriptions don't actually listen for notifications
// Use useUnseenPreferredNotificationGroups to listen for new notifications
export function usePreferredGroupedNotifications(
  privateUser: PrivateUser,
  cachedNotifications?: Notification[]
) {
  const result = useFirestoreQueryData(
    ['notifications-all', privateUser.id],
    getNotificationsQuery(privateUser.id)
  )
  const notifications = useMemo(() => {
    if (result.isLoading) return cachedNotifications ?? []
    if (!result.data) return cachedNotifications ?? []
    const notifications = result.data as Notification[]

    return getAppropriateNotifications(
      notifications,
      privateUser.notificationPreferences
    ).filter((n) => !n.isSeenOnHref)
  }, [
    cachedNotifications,
    privateUser.notificationPreferences,
    result.data,
    result.isLoading,
  ])

  return useMemo(() => {
    if (notifications) return groupNotifications(notifications)
  }, [notifications])
}

export function useUnseenPreferredNotificationGroups(privateUser: PrivateUser) {
  const notifications = useUnseenPreferredNotifications(privateUser, {})
  const [notificationGroups, setNotificationGroups] = useState<
    NotificationGroup[] | undefined
  >(undefined)
  useEffect(() => {
    if (!notifications) return

    const groupedNotifications = groupNotifications(notifications)
    setNotificationGroups(groupedNotifications)
  }, [notifications])
  return notificationGroups
}

export function groupNotifications(notifications: Notification[]) {
  let notificationGroups: NotificationGroup[] = []
  const notificationGroupsByDay = groupBy(notifications, (notification) =>
    new Date(notification.createdTime).toDateString()
  )
  Object.keys(notificationGroupsByDay).forEach((day) => {
    const notificationsGroupedByDay = notificationGroupsByDay[day]
    const incomeNotifications = notificationsGroupedByDay.filter(
      (notification) =>
        notification.sourceType === 'bonus' || notification.sourceType === 'tip'
    )
    const normalNotificationsGroupedByDay = notificationsGroupedByDay.filter(
      (notification) =>
        notification.sourceType !== 'bonus' && notification.sourceType !== 'tip'
    )
    if (incomeNotifications.length > 0) {
      notificationGroups = notificationGroups.concat({
        notifications: incomeNotifications,
        groupedById: 'income' + day,
        isSeen: incomeNotifications[0].isSeen,
        timePeriod: day,
        type: 'income',
      })
    }
    // Group notifications by contract, filtering out bonuses:
    const groupedNotificationsByContractId = groupBy(
      normalNotificationsGroupedByDay,
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
          isSeen: notificationsForContractId[0].isSeen,
          timePeriod: day,
          type: 'normal',
        }
        return notificationGroup
      })
    )
  })
  return notificationGroups
}

export function useUnseenPreferredNotifications(
  privateUser: PrivateUser,
  options: { customHref?: string },
  limit: number = NOTIFICATIONS_PER_PAGE
) {
  const { customHref } = options
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [userAppropriateNotifications, setUserAppropriateNotifications] =
    useState<Notification[]>([])

  useEffect(() => {
    return listenForNotifications(privateUser.id, setNotifications, {
      unseenOnly: true,
      limit,
    })
  }, [limit, privateUser.id])

  useEffect(() => {
    const notificationsToShow = getAppropriateNotifications(
      notifications,
      privateUser.notificationPreferences
    ).filter((n) =>
      customHref ? n.isSeenOnHref?.includes(customHref) : !n.isSeenOnHref
    )
    setUserAppropriateNotifications(notificationsToShow)
  }, [notifications, customHref, privateUser.notificationPreferences])

  return userAppropriateNotifications
}

const lessPriorityReasons = [
  'on_contract_with_users_comment',
  'on_contract_with_users_answer',
  'on_contract_with_users_shares_out',
  // Not sure if users will want to see these w/ less:
  // 'on_contract_with_users_shares_in',
]

function getAppropriateNotifications(
  notifications: Notification[],
  notificationPreferences?: notification_subscribe_types
) {
  if (notificationPreferences === 'all') return notifications
  if (notificationPreferences === 'less')
    return notifications.filter(
      (n) =>
        n.reason &&
        // Show all contract notifications and any that aren't in the above list:
        (n.sourceType === 'contract' || !lessPriorityReasons.includes(n.reason))
    )
  if (notificationPreferences === 'none') return []

  return notifications
}
