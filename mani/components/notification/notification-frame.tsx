import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import { ReactNode } from 'react'
import { fromNow } from 'util/time'
import { Notification, NotificationGroup } from 'common/notification'
import { Pressable } from 'react-native'
import { imageSizeMap } from 'components/user/avatar-circle'
import { NotificationHeader } from './notification-header'
import { router } from 'expo-router'

export const getNotificationColor = (notification: Notification) => {
  const color = useColor()
  return notification.isSeen ? color.textTertiary : color.text
}

export const getGroupNotificationColor = (notifications: NotificationGroup) => {
  const color = useColor()
  const { isSeen } = notifications
  return isSeen ? color.textTertiary : color.text
}

export function NotificationFrame({
  notification,
  children,
  icon,
  link,
  onClick,
  subtitle,
  isChildOfGroup,
}: {
  notification: Notification
  children: React.ReactNode
  icon: ReactNode
  link?: string
  onClick?: () => void
  subtitle?: string | ReactNode
  isChildOfGroup?: boolean
}) {
  const color = useColor()
  const frameObject = (
    <Row style={{ width: '100%' }}>
      <Row
        style={{
          width: '100%',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <Col
          style={{
            paddingTop: 4,
            width: imageSizeMap.md,
            height: imageSizeMap.md,
          }}
        >
          {icon}
        </Col>
        <Col
          style={{
            flex: 1,
            gap: 2,
          }}
        >
          <ThemedText
            size="md"
            weight="semibold"
            color={getNotificationColor(notification)}
          >
            {children}
          </ThemedText>
          <ThemedText size="sm" color={getNotificationColor(notification)}>
            {subtitle}
          </ThemedText>
        </Col>

        <ThemedText
          size="sm"
          color={color.textQuaternary}
          style={{ paddingTop: 4 }}
        >
          {fromNow(notification.createdTime, true)}
        </ThemedText>
      </Row>
    </Row>
  )
  return (
    <Col
      style={{
        width: '100%',
        // paddingVertical: isChildOfGroup ? 8 : 12,
        paddingTop: isChildOfGroup ? 8 : 12,
        paddingBottom: isChildOfGroup ? 0 : 12,
      }}
    >
      {!isChildOfGroup && (
        <NotificationHeader
          notification={notification}
          style={{ paddingBottom: 8 }}
          color={getNotificationColor(notification)}
        />
      )}

      <Pressable
        style={{ flex: 1, width: '100%' }}
        onPress={() => {
          if (link) {
            router.push(link as any)
          }
          if (onClick) {
            onClick()
          }
        }}
      >
        {frameObject}
      </Pressable>
    </Col>
  )
}
