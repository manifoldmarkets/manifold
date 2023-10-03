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
      user: User | undefined | null
      onReplyClick?: (chat: ChatMessage) => void
    },
    ref: React.Ref<HTMLDivElement>
  ) => {
    const { chats, user, onReplyClick } = props
    const chat = first(chats)
    if (!chat) return null
    const { userUsername, userAvatarUrl, userId, userName } = chat
    const isMe = user?.id === userId

    return (
      <Col
        className={clsx(
          'max-w-[90%] rounded-2xl p-3',
          isMe
            ? 'bg-primary-50 items-end self-end rounded-br-none'
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
          <UserLink name={userName} username={userUsername} />
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
