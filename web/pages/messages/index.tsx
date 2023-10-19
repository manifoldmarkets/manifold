import clsx from 'clsx'
import { User } from 'common/user'
import { parseJsonContentToText } from 'common/util/parse'
import { first } from 'lodash'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import NewMessageButton from 'web/components/messaging/new-message-button'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Avatar } from 'web/components/widgets/avatar'
import { Title } from 'web/components/widgets/title'
import {
  useHasUnseenPrivateMessage,
  useNonEmptyPrivateMessageChannelIds,
  useOtherUserIdsInPrivateMessageChannelIds,
  useRealtimePrivateMessagesPolling,
} from 'web/hooks/use-private-messages'
import { useIsAuthorized, usePrivateUser, useUser } from 'web/hooks/use-user'
import { useUsersInStore } from 'web/hooks/use-user-supabase'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'

export default function MessagesPage() {
  useRedirectIfSignedOut()
  const privateUser = usePrivateUser()
  const currentUser = useUser()
  const isAuthed = useIsAuthorized()
  const channelIds = useNonEmptyPrivateMessageChannelIds(
    currentUser?.id,
    isAuthed
  )

  const channelIdsToUserIds = useOtherUserIdsInPrivateMessageChannelIds(
    currentUser?.id,
    isAuthed,
    channelIds
  )
  const users = useUsersInStore(
    Object.values(channelIdsToUserIds ?? {}).flat()
  )?.filter((u) => !privateUser?.blockedUserIds.includes(u.id))

  return (
    <Page trackPageView={'messages page'} className={'p-2'}>
      <Row className="justify-between">
        <Title>Messages</Title>
        <NewMessageButton />
      </Row>
      <Col className={'w-full overflow-hidden'}>
        {currentUser && isAuthed && channelIds.length === 0 && (
          <div className={'text-ink-500 dark:text-ink-600 mt-4 text-center'}>
            You have no messages, yet.
          </div>
        )}
        {currentUser &&
          isAuthed &&
          channelIds.map((channelId) => {
            const userId = first(channelIdsToUserIds?.[channelId])
            const user = users?.find((u) => u.id === userId)
            if (!user) return null
            return (
              <MessageChannelRow
                key={user.id}
                toUser={user}
                currentUser={currentUser}
                channelId={channelId}
              />
            )
          })}
      </Col>
    </Page>
  )
}
const MessageChannelRow = (props: {
  toUser: User
  currentUser: User
  channelId: number
}) => {
  const { toUser, currentUser, channelId } = props
  const messages = useRealtimePrivateMessagesPolling(channelId, true, 2000)
  const unseen = useHasUnseenPrivateMessage(currentUser.id, channelId, messages)
  const chat = messages?.[0]
  return (
    <Link
      className="hover:bg-canvas-0 rounded p-2 transition-colors"
      key={channelId}
      href={'/messages/' + channelId}
    >
      <Row className={'items-center gap-3 rounded-md'}>
        <Avatar
          username={toUser?.username ?? ''}
          avatarUrl={toUser?.avatarUrl}
          noLink={true}
          size="lg"
        />
        <Col className={'w-full'}>
          <Row className={'items-center justify-between'}>
            <span className={'font-semibold'}>{toUser?.name}</span>
            <span className={'text-ink-400 dark:text-ink-500 text-xs'}>
              {chat && <RelativeTimestamp time={chat.createdTime} />}
            </span>
          </Row>
          <Row className="items-center justify-between gap-1">
            {!chat && (
              <div className="bg-ink-500 dark:bg-ink-600 h-4 w-2/3 animate-pulse py-1" />
            )}
            {chat && (
              <span
                className={clsx(
                  'line-clamp-1 text-sm',
                  unseen ? '' : 'text-ink-500 dark:text-ink-600'
                )}
              >
                {chat.userId == currentUser.id && 'You: '}
                {parseJsonContentToText(chat.content)}
              </span>
            )}
            {unseen && (
              <div
                className={clsx(
                  'text-canvas-0 bg-primary-500 h-4 min-w-[15px] rounded-full p-[2px] text-center text-[10px] '
                )}
              />
            )}
          </Row>
        </Col>
      </Row>
    </Link>
  )
}
