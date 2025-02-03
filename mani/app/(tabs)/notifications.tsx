import Page from 'components/page'

import { usePrivateUser, useUser } from 'hooks/use-user'
import { PrivateUser, User } from 'common/user'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import { ActivityIndicator } from 'react-native'
import { useIsPageVisible } from 'hooks/use-is-page-visibile'
import {
  NotificationItem,
  shouldIgnoreNotification,
} from 'components/notification/notification-item'
import { NotificationGroupItem } from 'components/notification/notification-group-item'
import { NotificationGroup } from 'common/notification'
import { useGroupedNotifications } from 'client-common/hooks/use-notifications'
import { api } from 'lib/api'
import { usePersistentLocalState } from 'hooks/use-persistent-local-state'
export default function Notifications() {
  const user = useUser()
  const privateUser = usePrivateUser()

  return (
    <Page>
      {user && privateUser && (
        <NotificationContent user={user} privateUser={privateUser} />
      )}
    </Page>
  )
}

export const NOTIFICATIONS_PER_PAGE = 30

export function NotificationContent({
  user,
  privateUser,
}: {
  user: User
  privateUser: PrivateUser
}) {
  const [page, setPage] = useState(0)

  const { groupedNotifications } = useGroupedNotifications(
    user,
    (params) => api('get-notifications', params),
    usePersistentLocalState
  )

  const paginatedGroupedNotifications = useMemo(() => {
    const start = page * NOTIFICATIONS_PER_PAGE
    const end = start + NOTIFICATIONS_PER_PAGE
    return groupedNotifications?.slice(start, end)
  }, [JSON.stringify(groupedNotifications), page])

  const color = useColor()
  const isPageVisible = useIsPageVisible()

  // Mark all notifications as seen. Rerun as new notifications come in.
  useEffect(() => {
    if (!privateUser || !isPageVisible) return
    api('mark-all-notifications-new', {})
  }, [privateUser?.id, isPageVisible])

  return (
    <Col style={{ width: '100%' }}>
      {groupedNotifications === undefined ||
      paginatedGroupedNotifications === undefined ? (
        <ActivityIndicator color={color.textQuaternary} size={'large'} />
      ) : paginatedGroupedNotifications.length === 0 ? (
        <ThemedText>You don't have any notifications, yet.</ThemedText>
      ) : (
        <>
          {groupedNotifications.map((notification) => (
            <Fragment key={notification.groupedById}>
              {notification.notifications.length === 1 &&
              !shouldIgnoreNotification(notification.notifications[0]) ? (
                <>
                  <NotificationItem
                    notification={notification.notifications[0]}
                    key={notification.notifications[0].id}
                  />
                </>
              ) : notification.notifications.every((notif) =>
                  shouldIgnoreNotification(notif)
                ) ? null : (
                <>
                  <NotificationGroupItem
                    notificationGroup={notification as NotificationGroup}
                    key={notification.groupedById}
                  />
                </>
              )}
            </Fragment>
          ))}
        </>
      )}
    </Col>
  )
}
