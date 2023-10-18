import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Content } from 'web/components/widgets/editor'
import { User } from 'common/user'
import { ChatMessage } from 'common/chat-message'
import { first } from 'lodash'
import { forwardRef } from 'react'

export const ChatMessageItem = forwardRef(
  (
    props: {
      chats: ChatMessage[]
      currentUser: User | undefined | null
      otherUser?: User | null
      onReplyClick?: (chat: ChatMessage) => void
      beforeSameUser?: boolean
      firstOfUser?: boolean
    },
    ref: React.Ref<HTMLDivElement>
  ) => {
    const {
      chats,
      currentUser,
      otherUser,
      onReplyClick,
      beforeSameUser,
      firstOfUser,
    } = props
    const chat = first(chats)
    if (!chat) return null
    const isMe = currentUser?.id === chat.userId
    const {
      username: userUsername,
      avatarUrl: userAvatarUrl,
      name: userName,
    } = !isMe && otherUser
      ? otherUser
      : isMe && currentUser
      ? currentUser
      : {
          username: chat.userUsername,
          avatarUrl: chat.userAvatarUrl,
          name: chat.userName,
        }

    return (
      <Row className={clsx('gap-1', isMe ? '' : 'flex-row-reverse')} ref={ref}>
        <Row className="grow" />
        <Col className={clsx(isMe ? 'pr-1' : '', 'grow-y justify-end py-3')}>
          <RelativeTimestamp
            time={chat.createdTime}
            shortened
            className="text-xs"
          />
        </Col>
        <Col className="max-w-[calc(100vw-6rem)] md:max-w-[80%]">
          {firstOfUser && !otherUser && (
            <span className="text-ink-500 dark:text-ink-600 mt-1 pl-3 text-sm">
              {chat.userName}
            </span>
          )}
          <Col
            className={clsx(
              'rounded-2xl p-3 drop-shadow-sm',
              isMe
                ? 'bg-primary-100 items-end self-end rounded-br-none'
                : 'bg-canvas-0 items-start self-start rounded-bl-none'
            )}
          >
            {chats.map((chat) => (
              <Content content={chat.content} key={chat.id} />
            ))}
          </Col>
        </Col>
        {!isMe && (
          <MessageAvatar
            beforeSameUser={!!beforeSameUser}
            userAvatarUrl={userAvatarUrl}
            username={userUsername}
          />
        )}
      </Row>
    )
  }
)

function MessageAvatar(props: {
  beforeSameUser: boolean
  userAvatarUrl?: string
  username?: string
}) {
  const { beforeSameUser, userAvatarUrl, username } = props
  return (
    <Col
      className={clsx(
        beforeSameUser ? 'pointer-events-none invisible' : '',
        'grow-y justify-end pb-2 pr-1'
      )}
    >
      <Avatar avatarUrl={userAvatarUrl} username={username} size="xs" />
    </Col>
  )
}
