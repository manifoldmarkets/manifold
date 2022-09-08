import { useMemo } from 'react'
import { notification_subscribe_types, PrivateUser } from 'common/user'
import { Notification } from 'common/notification'
import { getNotificationsQuery } from 'web/lib/firebase/notifications'
import { groupBy, map, partition } from 'lodash'
import { useFirestoreQueryData } from '@react-query-firebase/firestore'

export type NotificationGroup = {
  notifications: Notification[]
  groupedById: string
  isSeen: boolean
  timePeriod: string
  type: 'income' | 'normal'
}

function useNotifications(privateUser: PrivateUser) {
  const result = useFirestoreQueryData(
    ['notifications-all', privateUser.id],
    getNotificationsQuery(privateUser.id)
  )

  const notifications = useMemo(() => {
    if (!result.data) return undefined
    const notifications = result.data as Notification[]

    return getAppropriateNotifications(
      notifications,
      privateUser.notificationPreferences
    ).filter((n) => !n.isSeenOnHref)
  }, [privateUser.notificationPreferences, result.data])

  return notifications
}

export function useUnseenNotifications(privateUser: PrivateUser) {
  const notifications = useNotifications(privateUser)
  return useMemo(
    () => notifications && notifications.filter((n) => !n.isSeen),
    [notifications]
  )
}

export function useGroupedNotifications(privateUser: PrivateUser) {
  const notifications = useNotifications(privateUser)
  return useMemo(() => {
    if (notifications) return groupNotifications(notifications)
  }, [notifications])
}

export function useUnseenGroupedNotification(privateUser: PrivateUser) {
  const notifications = useUnseenNotifications(privateUser)
  return useMemo(() => {
    if (notifications) return groupNotifications(notifications)
  }, [notifications])
}

export function groupNotifications(notifications: Notification[]) {
  let notificationGroups: NotificationGroup[] = []
  const notificationGroupsByDay = groupBy(notifications, (notification) =>
    new Date(notification.createdTime).toDateString()
  )
  const incomeSourceTypes = [
    'bonus',
    'tip',
    'loan',
    'betting_streak_bonus',
    'tip_and_like',
  ]

  Object.keys(notificationGroupsByDay).forEach((day) => {
    const notificationsGroupedByDay = notificationGroupsByDay[day]
    const [incomeNotifications, normalNotificationsGroupedByDay] = partition(
      notificationsGroupedByDay,
      (notification) =>
        incomeSourceTypes.includes(notification.sourceType ?? '')
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

const lessPriorityReasons = [
  'on_contract_with_users_comment',
  'on_contract_with_users_answer',
  // Notifications not currently generated for users who've sold their shares
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
