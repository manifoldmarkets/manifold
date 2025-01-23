import { getSourceUrl, Notification } from 'common/notification'
import { NotificationFrame } from '../notification-frame'
import { AvatarCircle } from 'components/user/avatar-circle'
import { ThemedText } from 'components/themed-text'

export function TaggedUserNotification(props: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props
  const { sourceUserName, sourceUserAvatarUrl, sourceUserUsername } =
    notification
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      icon={
        <AvatarCircle
          avatarUrl={sourceUserAvatarUrl}
          username={sourceUserUsername}
          size={'md'}
        />
      }
      link={getSourceUrl(notification)}
    >
      <ThemedText>{sourceUserName} tagged you </ThemedText>
    </NotificationFrame>
  )
}
