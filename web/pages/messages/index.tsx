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
import { Content } from 'web/components/widgets/editor'
import { Title } from 'web/components/widgets/title'
import {
  useHasUnseenPrivateMessage,
  useNonEmptyPrivateMessageChannelIds,
  useOtherUserIdsInPrivateMessageChannelIds,
  usePrivateMessageChannelIds,
  useRealtimePrivateMessages,
} from 'web/hooks/use-private-messages'
import { useIsAuthorized, usePrivateUser, useUser } from 'web/hooks/use-user'
import { useUsersInStore } from 'web/hooks/use-user-supabase'
import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
export const getServerSideProps = redirectIfLoggedOut('/')

export default function MessagesPage() {
  redirectIfLoggedOut('/')
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
      <Col className={'w-full gap-2 overflow-hidden'}>
        {currentUser && isAuthed && channelIds.length === 0 && (
          <div className={'mt-4 text-center text-gray-400'}>
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
  const messages = useRealtimePrivateMessages(channelId, true)
  const unseen = useHasUnseenPrivateMessage(currentUser.id, channelId, messages)
  const chat = messages?.[0]
  return (
    <>
      <div className={'ml-14 w-full border-t'} />
      <Link key={channelId} href={'/messages/' + channelId}>
        <Row className={'hover:bg-canvas-50 items-center gap-2 rounded-md p-1'}>
          <Avatar
            username={toUser?.username ?? ''}
            avatarUrl={toUser?.avatarUrl}
            noLink={true}
          />
          <Col className={'w-full'}>
            <Row className={'items-center justify-between'}>
              <span className={'font-semibold'}>{toUser?.name}</span>
              <span className={'text-ink-400 text-xs'}>
                {chat && <RelativeTimestamp time={chat.createdTime} />}
              </span>
            </Row>
            <Row className="items-center justify-between gap-1">
              {!chat && (
                <div className="bg-ink-500 h-4 w-2/3 animate-pulse py-1" />
              )}
              {chat && (
                <span
                  className={clsx(
                    'line-clamp-1 text-sm',
                    unseen ? '' : 'text-ink-500'
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
    </>
  )
}
