import Page from 'components/page'

import { usePrivateUser, useUser } from 'hooks/use-user'
import { PrivateUser, User } from 'common/user'
import { Fragment, useMemo, useState } from 'react'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import { ActivityIndicator, View } from 'react-native'
import { EXAMPLE_NOTIFICATIONS } from 'assets/example-data/example-notifications'
import { useIsPageVisible } from 'hooks/use-is-page-visibile'
import {
  NotificationItem,
  shouldIgnoreNotification,
} from 'components/notification/notification-item'
import { NotificationGroupItem } from 'components/notification/notification-group-item'
import { NotificationGroup } from 'common/notification'
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

  const paginatedGroupedNotifications = useMemo(() => {
    const start = page * NOTIFICATIONS_PER_PAGE
    const end = start + NOTIFICATIONS_PER_PAGE
    return EXAMPLE_NOTIFICATIONS?.slice(start, end)
  }, [JSON.stringify(EXAMPLE_NOTIFICATIONS), page])

  const color = useColor()
  const isPageVisible = useIsPageVisible()

  return (
    <Col style={{ width: '100%' }}>
      {EXAMPLE_NOTIFICATIONS === undefined ||
      paginatedGroupedNotifications === undefined ? (
        <ActivityIndicator color={color.textQuaternary} size={'large'} />
      ) : paginatedGroupedNotifications.length === 0 ? (
        <ThemedText>You don't have any notifications, yet.</ThemedText>
      ) : (
        <>
          {EXAMPLE_NOTIFICATIONS.map((notification) => (
            <Fragment key={notification.groupedById}>
              {notification.notifications.length === 1 &&
              !shouldIgnoreNotification(notification.notifications[0]) ? (
                <>
                  <NotificationItem
                    notification={notification.notifications[0]}
                    key={notification.notifications[0].id}
                  />
                  <View
                    style={{
                      height: 1,
                      backgroundColor: color.borderSecondary,
                    }}
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
                  <View
                    style={{
                      height: 1,
                      backgroundColor: color.borderSecondary,
                    }}
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
