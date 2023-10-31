import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
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
      beforeSameUser: boolean
      firstOfUser: boolean
    },
    ref: React.Ref<HTMLDivElement>
  ) => {
    const { chats, currentUser, otherUser, beforeSameUser, firstOfUser } = props
    const chat = first(chats)
    if (!chat) return null
    const isMe = currentUser?.id === chat.userId
    const { username, avatarUrl } =
      !isMe && otherUser
        ? otherUser
        : isMe && currentUser
        ? currentUser
        : { username: '', avatarUrl: undefined }

    return (
      <Row
        className={clsx(
          'gap-1',
          isMe ? '' : 'flex-row-reverse',
          firstOfUser ? 'mt-3' : ''
        )}
        ref={ref}
      >
        <Row className="grow" />
        <Col className={clsx(isMe ? 'pr-1' : '', 'grow-y justify-end pb-2')}>
          <RelativeTimestamp
            time={chat.createdTime}
            shortened
            className="text-xs"
          />
        </Col>
        <Col className="max-w-[calc(100vw-6rem)] md:max-w-[80%]">
          <Col
            className={clsx(
              'rounded-3xl px-3 py-2 drop-shadow-sm',
              chat.visibility === 'system_status'
                ? 'bg-canvas-50 italic  drop-shadow-none'
                : isMe
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
            beforeSameUser={beforeSameUser}
            userAvatarUrl={avatarUrl}
            username={username}
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
