import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import { ReactNode } from 'react'
import { fromNow } from 'util/time'
import { Notification } from 'common/notification'
import { Pressable } from 'react-native'
import { imageSizeMap } from 'components/user/avatar-circle'

export function NotificationFrame({
  notification,
  children,
  icon,
  link,
  onClick,
  subtitle,
  isChildofGroup,
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
          }}
        >
          <ThemedText size="md" weight="semibold">
            {children}
          </ThemedText>
          <ThemedText>{subtitle}</ThemedText>
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
    <Row
      style={{
        width: '100%',
      }}
    >
      {link && (
        <Col style={{ flex: 1 }}>
          <a href={link} style={{ textDecoration: 'none' }}>
            {frameObject}
          </a>
        </Col>
      )}
      {!link && (
        <Pressable
          style={{ flex: 1, width: '100%' }}
          onPress={() => {
            if (onClick) {
              onClick()
            }
          }}
        >
          {frameObject}
        </Pressable>
      )}
    </Row>
  )
}
