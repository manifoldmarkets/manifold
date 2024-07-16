import {
  BalanceChangeNotificationTypes,
  CommentNotificationData,
  Notification,
  notification_source_types,
  NotificationReason,
} from 'common/notification'
import { Dictionary, first, groupBy, sortBy } from 'lodash'
import { useEffect, useMemo } from 'react'
import { NOTIFICATIONS_PER_PAGE } from 'web/components/notifications/notification-helpers'
import { User } from 'common/user'

import { api } from 'web/lib/api/api'
import { useApiSubscription } from 'web/hooks/use-api-subscription'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export type NotificationGroup = {
  notifications: Notification[]
  groupedById: string
  isSeen: boolean
}

function useNotifications(userId: string, count = 15 * NOTIFICATIONS_PER_PAGE) {
  const [notifications, setNotifications] = usePersistentLocalState<
    Notification[] | undefined
  >(undefined, 'notifications-' + userId)
  useEffect(() => {
    if (userId)
      api('get-notifications', { limit: count }).then((data) => {
        setNotifications(data)
      })
  }, [userId])

  useApiSubscription({
    topics: [`user-notifications/${userId}`],
    onBroadcast: ({ data }) => {
      setNotifications((notifs) => [
        data.notification as Notification,
        ...(notifs ?? []),
      ])
    },
  })
  return notifications
}

function useUnseenNotifications(
  userId: string,
  count = NOTIFICATIONS_PER_PAGE
) {
  const notifs = useNotifications(userId, count)
  return notifs?.filter((n) => !n.isSeen)
}

export function useGroupedUnseenNotifications(
  userId: string,
  selectTypes?: notification_source_types[],
  selectReasons?: NotificationReason[]
) {
  const notifications = useUnseenNotifications(userId)?.filter(
    (n) =>
      (selectTypes?.includes(n.sourceType) ||
        selectReasons?.includes(n.reason)) ??
      true
  )
  return useMemo(() => {
    return notifications ? groupNotificationsForIcon(notifications) : undefined
  }, [notifications])
}

export function useGroupedNotifications(
  user: User,
  selectTypes?: notification_source_types[],
  selectReasons?: NotificationReason[]
) {
  const notifications = useNotifications(user.id)?.filter(
    (n) =>
      (selectTypes?.includes(n.sourceType) ||
        selectReasons?.includes(n.reason)) ??
      true
  )
  const sortedNotifications = notifications
    ? sortBy(notifications, (n) => -n.createdTime)
    : undefined

  const [groupedNotifications, mostRecentNotification] =
    groupGeneralNotifications(sortedNotifications, [
      'loan_income',
      'contract_from_followed_user',
    ])

  const groupedBalanceChangeNotifications = groupSpecificNotifications(
    sortedNotifications,
    (n) => BalanceChangeNotificationTypes.includes(n.reason)
  )
  const groupedNewMarketNotifications = groupSpecificNotifications(
    sortedNotifications,
    (n) => n.reason === 'contract_from_followed_user',
    (n) => new Date(n.createdTime).toDateString() + n.sourceUserUsername
  )
  const groupedMentionNotifications = groupSpecificNotifications(
    sortedNotifications,
    (n) =>
      n.reason === 'tagged_user' ||
      (n.sourceType === 'comment' &&
        n.sourceText &&
        n.sourceText.includes('@' + user.username + ' ')) ||
      ((n.reason === 'all_comments_on_my_markets' ||
        n.reason === 'comment_on_your_contract') &&
        !(n.data as CommentNotificationData)?.isReply)
  )

  return useMemo(
    () => ({
      mostRecentNotification,
      groupedNotifications,
      groupedBalanceChangeNotifications,
      groupedNewMarketNotifications,
      groupedMentionNotifications,
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
        : n.sourceType === 'love_like'
        ? 'love_like'
        : n.sourceType === 'love_ship'
        ? 'love_ship'
        : n.data?.isPartner
        ? 'isPartner'
        : `${n.sourceTitle}${n.sourceContractId}`)
  )
  const mostRecentNotification = first(sortedNotifications)
  const groupedNotifications = groupNotifications(
    groupedNotificationsByDayAndContract
  )

  return [groupedNotifications, mostRecentNotification] as const
}

function groupSpecificNotifications(
  sortedNotifications: Notification[] | undefined,
  filter: (n: Notification) => boolean,
  groupByKey?: (n: Notification) => string
) {
  if (!sortedNotifications) return undefined
  const filteredNotifications = sortedNotifications.filter(filter)
  const notificationGroupsByDayAndContract = groupBy(
    filteredNotifications,
    (n) =>
      groupByKey
        ? groupByKey(n)
        : new Date(n.createdTime).toDateString() +
          n.sourceContractId +
          n.sourceTitle
  )

  return groupNotifications(notificationGroupsByDayAndContract)
}
