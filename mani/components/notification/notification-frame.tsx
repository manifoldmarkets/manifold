import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import { ReactNode } from 'react'
import { fromNow } from 'util/time'
import { Notification } from 'common/notification'
import { Pressable } from 'react-native'

export function NotificationFrame({
  notification,
  highlighted,
  setHighlighted,
  children,
  icon,
  link,
  onClick,
  subtitle,
  isChildofGroup,
}: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  children: React.ReactNode
  icon: ReactNode
  link?: string
  onClick?: () => void
  subtitle?: string | ReactNode
  isChildOfGroup?: boolean
}) {
  const color = useColor()
  const frameObject = (
    <Row>
      <Row style={{ width: '100%', alignItems: 'flex-start', gap: 4 }}>
        <Col
          style={{
            position: 'relative',
            height: '100%',
            width: '40px',
            alignItems: 'center',
          }}
        >
          {icon}
        </Col>
        <Col style={{ width: '100%' }}>
          <span>{children}</span>
          <div className="mt-1 line-clamp-3 text-xs md:text-sm">{subtitle}</div>
        </Col>

        <ThemedText size="sm" color={color.textQuaternary}>
          {fromNow(notification.createdTime, true)}
        </ThemedText>
      </Row>
    </Row>
  )
  return (
    <Row
      style={{
        flexDirection: 'row',
        padding: 8,
      }}
    >
      {link && (
        <Col style={{ flex: 1 }}>
          <Pressable
            onPress={() => {
              if (highlighted) {
                setHighlighted(false)
              }
            }}
            style={{
              flex: 1,
              flexDirection: 'column',
            }}
          >
            {frameObject}
          </Pressable>
        </Col>
      )}
      {!link && (
        <Pressable
          style={{ flex: 1 }}
          onPress={() => {
            if (highlighted) {
              setHighlighted(false)
            }
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
