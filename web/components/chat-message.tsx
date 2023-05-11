import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Content } from 'web/components/widgets/editor'
import { User } from 'common/user'
import { ChatMessage } from 'common/chat-message'

export const ChatMessageItem = (props: {
  chat: ChatMessage
  user: User | undefined | null
}) => {
  const { chat, user } = props
  return (
    <Col
      className={clsx(
        'bg-canvas-0 p-2',
        user?.id === chat.userId ? 'items-end' : 'items-start'
      )}
      key={chat.id}
    >
      <Col
        className={clsx(
          'bg-canvas-100 max-w-[90%] rounded-md p-2',
          user?.id === chat.userId ? 'items-end' : 'items-start'
        )}
      >
        <Row className={'items-center gap-2'}>
          <Avatar
            size={'xs'}
            avatarUrl={chat.userAvatarUrl}
            username={chat.userUsername}
          />
          <UserLink
            className={'text-sm'}
            name={chat.userName}
            username={chat.userUsername}
          />
          <span className={' -ml-2 text-sm'}>
            <RelativeTimestamp time={chat.createdTime} />
          </span>
        </Row>
        <Row className={'ml-1'}>
          <Content content={chat.content} />
        </Row>
      </Col>
    </Col>
  )
}
