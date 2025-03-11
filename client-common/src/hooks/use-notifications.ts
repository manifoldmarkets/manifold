import {
  BalanceChangeNotificationTypes,
  CommentNotificationData,
  Notification,
  notification_source_types,
  NotificationGroup,
  NotificationReason,
} from 'common/notification'
import {
  concat,
  Dictionary,
  first,
  groupBy,
  sortBy,
  uniq,
  uniqBy,
} from 'lodash'
import { useEffect, useMemo } from 'react'
import { User } from 'common/user'

import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { APIParams, APIResponse } from 'common/api/schema'

export const NOTIFICATIONS_PER_PAGE = 30

export function useNotifications(
  userId: string,
  api: (
    params: APIParams<'get-notifications'>
  ) => Promise<APIResponse<'get-notifications'>>,
  usePersistentLocalState: <T>(
    initialValue: T,
    key: string
  ) => readonly [T, (newState: T | ((prevState: T) => T)) => void, boolean],
  count = 15 * NOTIFICATIONS_PER_PAGE,
  newOnly?: boolean
) {
  const [notifications, setNotifications] = usePersistentLocalState<
    Notification[] | undefined
  >(undefined, 'notifications-' + userId)
  const [latestCreatedTime, setLatestCreatedTime] = usePersistentLocalState<
    number | undefined
  >(undefined, 'latest-notification-time-' + userId)

  const markAllAsSeen = () => {
    if (!notifications) return

    setNotifications((oldData) => {
      if (!oldData) return oldData
      return oldData.map((n) => ({
        ...n,
        isSeen: true,
      }))
    })
  }

  useEffect(() => {
    if (userId) {
      const params = {
        limit: count,
        after: newOnly ? latestCreatedTime : undefined,
      }
      api(params).then((newData) => {
        setNotifications((oldData) => {
          const allNotifications = concat(newData, oldData ?? [])

          const seenIds = uniq(
            allNotifications.filter((n) => n.isSeen).map((n) => n.id)
          )

          const updatedNotifications = uniqBy(allNotifications, 'id').map(
            (n) => ({
              ...n,
              isSeen: seenIds.includes(n.id) || n.isSeen,
            })
          )

          const newLatestCreatedTime = Math.max(
            ...updatedNotifications.map((n) => n.createdTime),
            latestCreatedTime ?? 0
          )
          setLatestCreatedTime(newLatestCreatedTime)
          return updatedNotifications
        })
      })
    }
  }, [userId, count, newOnly])

  useApiSubscription({
    topics: [`user-notifications/${userId}`],
    onBroadcast: ({ data }) => {
      console.log('new notification', data)
      setNotifications((notifs) => {
        const newNotification = data.notification as Notification
        setLatestCreatedTime((prevTime) =>
          Math.max(prevTime ?? 0, newNotification.createdTime)
        )
        return [newNotification, ...(notifs ?? [])]
      })
    },
  })
  return { notifications, markAllAsSeen }
}

export function useGroupedUnseenNotifications(
  userId: string,
  api: (
    params: APIParams<'get-notifications'>
  ) => Promise<APIResponse<'get-notifications'>>,
  usePersistentLocalState: <T>(
    initialValue: T,
    key: string
  ) => readonly [T, (newState: T | ((prevState: T) => T)) => void, boolean]
) {
  const { notifications: unseenNotifs } = useNotifications(
    userId,
    api,
    usePersistentLocalState,
    NOTIFICATIONS_PER_PAGE,
    true
  )
  const filteredUnseenNotifs = unseenNotifs?.filter((n) => !n.isSeen)

  return useMemo(() => {
    return filteredUnseenNotifs
      ? groupNotificationsForIcon(filteredUnseenNotifs)
      : undefined
  }, [filteredUnseenNotifs?.length])
}

export function useGroupedNotifications(
  user: User,
  api: (
    params: APIParams<'get-notifications'>
  ) => Promise<APIResponse<'get-notifications'>>,
  usePersistentLocalState: <T>(
    initialValue: T,
    key: string
  ) => readonly [T, (newState: T | ((prevState: T) => T)) => void, boolean],
  selectTypes?: notification_source_types[],
  selectReasons?: NotificationReason[]
) {
  const { notifications, markAllAsSeen } = useNotifications(
    user.id,
    api,
    usePersistentLocalState
  )
  const filteredNotifications = notifications?.filter(
    (n) =>
      (selectTypes?.includes(n.sourceType) ||
        selectReasons?.includes(n.reason)) ??
      true
  )
  const sortedNotifications = filteredNotifications
    ? sortBy(filteredNotifications, (n) => -n.createdTime)
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
      markAllAsSeen,
    }),
    [JSON.stringify(notifications)]
  )
}

const groupNotifications = (
  notifications: Dictionary<Notification[]>
): NotificationGroup[] => {
  return Object.entries(notifications).map(([key, value]) => ({
    notifications: value,
    groupedById: key,
    isSeen: value.every((n) => n.isSeen),
    latestCreatedTime: Math.max(...value.map((n) => n.createdTime)),
  }))
}

function groupNotificationsForIcon(notifications: Notification[]) {
  const sortedNotifications = sortBy(notifications, (n) => -n.createdTime)
  const notificationGroupsByDayOrDayAndContract = groupBy(
    sortedNotifications,
    (notification) =>
      notification.reason === 'contract_from_followed_user' ||
      notification.reason === 'market_movements'
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
        : n.reason === 'market_movements'
        ? 'market_movements'
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
