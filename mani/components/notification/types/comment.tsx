import { getSourceUrl, Notification } from 'common/notification'
import { NotificationFrame } from '../notification-frame'
import { AvatarCircle } from 'components/user/avatar-circle'
import { extractTextFromContent } from 'components/content/content-utils'
import { truncateText } from 'lib/truncate-text'

export function CommentNotification(props: {
  notification: Notification
  isChildOfGroup?: boolean
}) {
  const { notification, isChildOfGroup } = props
  const {
    sourceUserName,
    sourceUserUsername,
    reason,
    sourceText,
    sourceUserAvatarUrl,
  } = notification
  const reasonText =
    reason === 'reply_to_users_answer' || reason === 'reply_to_users_comment'
      ? 'replied to you '
      : `commented `
  const comment = sourceText
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
      subtitle={
        comment ? (
          <>{truncateText(extractTextFromContent(comment), '2xl')}</>
        ) : (
          <></>
        )
      }
      link={getSourceUrl(notification)}
    >
      <>
        {sourceUserName} {reasonText}
      </>
    </NotificationFrame>
  )
}
