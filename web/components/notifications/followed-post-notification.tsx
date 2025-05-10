import { Notification } from 'common/notification'
import { NotificationFrame } from './notification-helpers'
import { AvatarNotificationIcon } from './notification-helpers'
import { NotificationUserLink } from './notification-helpers'
import { PrimaryNotificationLink } from './notification-helpers'
import { getSourceUrl } from 'common/notification'

export function NewPostFromFollowedUserNotification(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup, highlighted, setHighlighted } = props
  const {
    sourceId,
    reason,
    sourceUserName,
    sourceUserUsername,
    sourceTitle,
    sourceText,
  } = notification

  return (
    <NotificationFrame
      notification={notification}
      isChildOfGroup={isChildOfGroup}
      highlighted={highlighted}
      setHighlighted={setHighlighted}
      icon={
        <AvatarNotificationIcon notification={notification} symbol={'✍️'} />
      }
      link={getSourceUrl(notification)}
      subtitle={sourceText}
    >
      <div className="line-clamp-3">
        <NotificationUserLink
          userId={sourceId}
          name={sourceUserName}
          username={sourceUserUsername}
        />{' '}
        <span>
          wrote a new {reason === 'admin' ? 'announcement' : ''}
          {' post '}
          <PrimaryNotificationLink text={sourceTitle} />
        </span>
      </div>
    </NotificationFrame>
  )
}
