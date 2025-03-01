import { getSourceUrl, Notification } from 'common/notification'
import { NotificationFrame } from '../notification-frame'
import { AvatarCircle } from 'components/user/avatar-circle'

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
      <>{sourceUserName} tagged you </>
    </NotificationFrame>
  )
}
