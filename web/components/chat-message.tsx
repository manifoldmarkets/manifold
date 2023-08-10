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
  isOwner: boolean
  onReplyClick?: (chat: ChatMessage) => void
}) => {
  const { chats, isOwner, user, onReplyClick } = props
  const chat = first(chats)
  if (!chat) return null
  const { userUsername, userAvatarUrl, userId, userName } = chat
  return (
    <Col
      className={clsx(
        'p-0.5',
        user?.id === userId ? 'items-end' : 'items-start'
      )}
    >
      <Col
        className={clsx(
          'bg-canvas-100 max-w-[90%] rounded-md px-2 py-1.5',
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
            className={clsx('text-sm', isOwner ? 'font-bold' : '')}
            name={userName}
            username={userUsername}
          />
          <span className={'text-sm'}>
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
