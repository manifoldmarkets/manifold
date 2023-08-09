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

export const ChatMessageItem = (props: {
  chats: ChatMessage[]
  user: User | undefined | null
  onReplyClick?: (chat: ChatMessage) => void
}) => {
  const { chats, user, onReplyClick } = props
  const chat = first(chats)
  if (!chat) return null
  const { userUsername, userAvatarUrl, userId, userName } = chat
  return (
    <Col
      className={clsx(
        'bg-canvas-0 p-2',
        user?.id === userId ? 'items-end' : 'items-start'
      )}
    >
      <Col
        className={clsx(
          'bg-canvas-100 max-w-[90%] rounded-md p-2',
          user?.id === userId ? 'items-end' : 'items-start'
        )}
      >
        <Row className={'items-center gap-2'}>
          <Avatar
            size={'xs'}
            avatarUrl={userAvatarUrl}
            username={userUsername}
          />
          <UserLink
            className={'text-sm'}
            name={userName}
            username={userUsername}
          />
          <span className={' -ml-2 text-sm'}>
            <RelativeTimestamp time={chat.createdTime} />
          </span>
        </Row>
        {chats.map((chat) => (
          <Row key={chat.id + 'content'} className={'ml-1'}>
            <Content content={chat.content} />
          </Row>
        ))}
        <Row>
          {user?.id !== chats[0].userId && onReplyClick && (
            <button
              className={
                'self-start py-1 text-xs font-bold text-gray-500 hover:underline'
              }
              onClick={() => onReplyClick(chat)}
            >
              Reply
            </button>
          )}
        </Row>
      </Col>
    </Col>
  )
}
