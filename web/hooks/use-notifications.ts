import { useEffect, useState } from 'react'
import { listenForPrivateUser } from 'web/lib/firebase/users'
import { notification_subscribe_types, PrivateUser } from 'common/user'
import { Notification } from 'common/notification'
import { listenForNotifications } from 'web/lib/firebase/notifications'

export function useNotifications(
  userId: string | undefined,
  options: { unseenOnly: boolean }
) {
  const { unseenOnly } = options
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
  }, [privateUser])

  useEffect(() => {
    if (!privateUser) return

    const notificationsToShow = getAppropriateNotifications(
      notifications,
      privateUser.notificationPreferences
    )
    setUserAppropriateNotifications(notificationsToShow)
  }, [privateUser, notifications])

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
        // Show all contract notifications
        (n.sourceType === 'contract' || !lessPriorityReasons.includes(n.reason))
    )
  if (notificationPreferences === 'none') return []

  return notifications
}
