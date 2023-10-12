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
    },
    ref: React.Ref<HTMLDivElement>
  ) => {
    const { chats, currentUser, otherUser, onReplyClick } = props
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
      <Col
        className={clsx(
          'max-w-[90%] rounded-2xl p-3',
          isMe
            ? 'bg-primary-100 items-end self-end rounded-br-none'
            : 'bg-canvas-0 items-start self-start rounded-bl-none'
        )}
        ref={ref}
      >
        <Row className={'mb-1 items-center gap-1 text-sm'}>
          <Avatar
            size={'2xs'}
            avatarUrl={userAvatarUrl}
            username={userUsername}
          />
          <UserLink name={userName ?? ''} username={userUsername ?? ''} />
          <RelativeTimestamp time={chat.createdTime} />
        </Row>
        {chats.map((chat) => (
          <Content content={chat.content} key={chat.id} />
        ))}
        {!isMe && onReplyClick && (
          <button
            className={'text-ink-500 mt-1 text-xs font-bold hover:underline'}
            onClick={() => onReplyClick(chat)}
          >
            Reply
          </button>
        )}
      </Col>
    )
  }
)
