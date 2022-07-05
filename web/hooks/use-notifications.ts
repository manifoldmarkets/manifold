import { useEffect, useState } from 'react'
import { listenForPrivateUser } from 'web/lib/firebase/users'
import { notification_subscribe_types, PrivateUser } from 'common/user'
import { Notification } from 'common/notification'
import { listenForNotifications } from 'web/lib/firebase/notifications'
import { groupBy, map } from 'lodash'

export type NotificationGroup = {
  notifications: Notification[]
  groupedById: string
  isSeen: boolean
  timePeriod: string
  type: 'income' | 'normal'
}

export function usePreferredGroupedNotifications(
  userId: string | undefined,
  options: { unseenOnly: boolean }
) {
  const [notificationGroups, setNotificationGroups] = useState<
    NotificationGroup[] | undefined
  >(undefined)

  const notifications = usePreferredNotifications(userId, options)
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
    const bonusNotifications = notificationsGroupedByDay.filter(
      (notification) => notification.sourceType === 'bonus'
    )
    const normalNotificationsGroupedByDay = notificationsGroupedByDay.filter(
      (notification) => notification.sourceType !== 'bonus'
    )
    if (bonusNotifications.length > 0) {
      notificationGroups = notificationGroups.concat({
        notifications: bonusNotifications,
        groupedById: 'income' + day,
        isSeen: bonusNotifications[0].isSeen,
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

export function usePreferredNotifications(
  userId: string | undefined,
  options: { unseenOnly: boolean; customHref?: string }
) {
  const { unseenOnly, customHref } = options
  const [privateUser, setPrivateUser] = useState<PrivateUser | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [userAppropriateNotifications, setUserAppropriateNotifications] =
    useState<Notification[]>([])

  useEffect(() => {
    if (userId) listenForPrivateUser(userId, setPrivateUser)
  }, [userId])

  useEffect(() => {
    if (privateUser)
      return listenForNotifications(
        privateUser.id,
        setNotifications,
        unseenOnly
      )
  }, [privateUser, unseenOnly])

  useEffect(() => {
    if (!privateUser) return

    const notificationsToShow = getAppropriateNotifications(
      notifications,
      privateUser.notificationPreferences
    ).filter((n) =>
      customHref ? n.isSeenOnHref?.includes(customHref) : !n.isSeenOnHref
    )
    setUserAppropriateNotifications(notificationsToShow)
  }, [privateUser, notifications, customHref])

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
