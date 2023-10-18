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
      beforeSameUser: boolean
    },
    ref: React.Ref<HTMLDivElement>
  ) => {
    const { chats, currentUser, otherUser, onReplyClick, beforeSameUser } =
      props
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
        <Col className="grow-y justify-end py-3">
          <RelativeTimestamp
            time={chat.createdTime}
            shortened
            className="text-xs"
          />
        </Col>
        <Col
          className={clsx(
            'max-w-[90%] rounded-2xl p-3',
            isMe
              ? 'bg-primary-100 items-end self-end rounded-br-none'
              : 'bg-canvas-0 items-start self-start rounded-bl-none'
          )}
        >
          {chats.map((chat) => (
            <Content content={chat.content} key={chat.id} />
          ))}
        </Col>
        {!isMe && (
          <MessageAvatar
            beforeSameUser={beforeSameUser}
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
  if (beforeSameUser) {
    return <div className="w-10" />
  }
  return (
    <Col className="grow-y justify-end">
      <Avatar avatarUrl={userAvatarUrl} username={username} />
    </Col>
  )
}
