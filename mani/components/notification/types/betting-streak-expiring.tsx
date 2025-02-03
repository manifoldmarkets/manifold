import { NotificationFrame } from '../notification-frame'
import { Notification } from 'common/notification'
import { LogoAvatar } from 'components/ui/logo-avatar'

export function BettingStreakExpiringNotification(props: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props

  const streakInDays = notification.data?.streak

  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      icon={<LogoAvatar size="md" />}
      subtitle={'Place a prediction in the next 3 hours to keep it.'}
    >
      <>Don't let your {streakInDays} day prediction streak expire!</>
    </NotificationFrame>
  )
}
