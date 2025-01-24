import { Token } from 'components/token/token'
import { getNotificationColor, NotificationFrame } from '../notification-frame'
import { Notification } from 'common/notification'
import { IncomeNotificationLabel } from '../income-notification-label'
import { imageSizeMap } from 'components/user/avatar-circle'

export function PushNotificationBonusNotification(props: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props
  const { isSeen } = notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      icon={
        <Token
          overrideToken={'MANA'}
          style={{ width: imageSizeMap.md, height: imageSizeMap.md }}
        />
      }
    >
      <>
        <IncomeNotificationLabel
          notification={notification}
          color={getNotificationColor(notification)}
        />{' '}
        for enabling push notifications
      </>
    </NotificationFrame>
  )
}
