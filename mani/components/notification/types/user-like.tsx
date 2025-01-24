import { NotificationFrame } from '../notification-frame'
import { getSourceUrl, Notification } from 'common/notification'
import { extractTextFromContent } from 'components/content/content-utils'
import { AvatarCircle } from 'components/user/avatar-circle'

export function UserLikeNotification(props: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props
  const { sourceUserName, sourceType, sourceText, sourceUserAvatarUrl } =
    notification
  const relatedNotifications: Notification[] = notification.data
    ?.relatedNotifications ?? [notification]
  const reactorsText =
    relatedNotifications.length > 1
      ? `${sourceUserName} & ${relatedNotifications.length - 1} other${
          relatedNotifications.length > 2 ? 's' : ''
        }`
      : sourceUserName

  if (sourceType != 'comment_like') {
    return null
  }

  // TODO: add like modal
  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      icon={
        <AvatarCircle
          username={sourceUserName}
          avatarUrl={sourceUserAvatarUrl}
          size="md"
        />
      }
      link={getSourceUrl(notification)}
      subtitle={<>{extractTextFromContent(sourceText)}</>}
    >
      {reactorsText && <>{reactorsText}</>} liked your comment
    </NotificationFrame>
  )
}
