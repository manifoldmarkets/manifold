import clsx from 'clsx'
import { MANIFOLD_LOVE_LOGO, User } from 'common/user'
import { parseJsonContentToText } from 'common/util/parse'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import NewMessageButton from 'web/components/messaging/new-message-button'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Title } from 'web/components/widgets/title'
import {
  useHasUnseenPrivateMessage,
  useNonEmptyPrivateMessageChannels,
  useOtherUserIdsInPrivateMessageChannelIds,
  useRealtimePrivateMessagesPolling,
} from 'web/hooks/use-private-messages'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { useUsersInStore } from 'web/hooks/use-user-supabase'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { MultipleOrSingleAvatars } from 'web/components/multiple-or-single-avatars'
import { Row as rowFor } from 'common/supabase/utils'

export default function MessagesPage() {
  return (
    <Page trackPageView={'messages page'} className={'p-2'}>
      <MessagesContent />
    </Page>
  )
}

export function MessagesContent() {
  useRedirectIfSignedOut()
  const currentUser = useUser()
  const isAuthed = useIsAuthorized()
  const channels = useNonEmptyPrivateMessageChannels(currentUser?.id, isAuthed)

  const channelIdsToUserIds = useOtherUserIdsInPrivateMessageChannelIds(
    currentUser?.id,
    isAuthed,
    channels
  )

  return (
    <>
      <Row className="justify-between">
        <Title>Messages</Title>
        <NewMessageButton />
      </Row>
      <Col className={'w-full overflow-hidden'}>
        {currentUser && isAuthed && channels.length === 0 && (
          <div className={'text-ink-500 dark:text-ink-600 mt-4 text-center'}>
            You have no messages, yet.
          </div>
        )}
        {currentUser &&
          isAuthed &&
          channels.map((channel) => {
            const userIds = channelIdsToUserIds?.[channel.id]?.map(
              (m) => m.user_id
            )
            if (!userIds) return null
            return (
              <MessageChannelRow
                key={channel.id}
                otherUserIds={userIds}
                currentUser={currentUser}
                channel={channel}
              />
            )
          })}
      </Col>
    </>
  )
}
export const MessageChannelRow = (props: {
  otherUserIds: string[]
  currentUser: User
  channel: rowFor<'private_user_message_channels'>
}) => {
  const { otherUserIds, currentUser, channel } = props
  const channelId = channel.id
  const otherUsers = channel.title
    ? [
        {
          id: 'manifold',
          name: 'Manifold',
          avatarUrl: MANIFOLD_LOVE_LOGO,
        },
      ]
    : // eslint-disable-next-line react-hooks/rules-of-hooks
      useUsersInStore(otherUserIds, `${channelId}`, 100)

  const messages = useRealtimePrivateMessagesPolling(
    channelId,
    true,
    2000,
    1,
    true
  )
  const unseen = useHasUnseenPrivateMessage(currentUser.id, channelId, messages)
  const chat = messages?.[0]
  const numOthers = otherUsers?.length ?? 0

  return (
    <Link
      className="hover:bg-canvas-0 rounded p-2 transition-colors"
      key={channelId}
      href={'/messages/' + channelId}
    >
      <Row className={'items-center gap-3 rounded-md'}>
        <MultipleOrSingleAvatars
          size="md"
          spacing={numOthers === 2 ? 0.3 : 0.15}
          startLeft={numOthers === 2 ? 2.2 : 1.2}
          avatarUrls={otherUsers?.map((user) => user.avatarUrl) ?? []}
          className={numOthers > 1 ? '-ml-2' : ''}
        />
        <Col className={'w-full'}>
          <Row className={'items-center justify-between'}>
            <span className={'font-semibold'}>
              {channel.title ? (
                <span className={'font-semibold'}>{channel.title}</span>
              ) : (
                otherUsers && (
                  <span>
                    {otherUsers
                      .map((user) => user.name.split(' ')[0].trim())
                      .slice(0, 2)
                      .join(', ')}
                    {otherUsers.length > 2 &&
                      ` & ${otherUsers.length - 2} more`}
                  </span>
                )
              )}
            </span>
            <span className={'text-ink-400 dark:text-ink-500 text-xs'}>
              {chat && <RelativeTimestamp time={chat.createdTime} />}
            </span>
          </Row>
          <Row className="items-center justify-between gap-1">
            <span
              className={clsx(
                'line-clamp-1 h-5 text-sm',
                unseen ? '' : 'text-ink-500 dark:text-ink-600'
              )}
            >
              {chat && (
                <>
                  {chat.userId == currentUser.id && 'You: '}
                  {parseJsonContentToText(chat.content)}
                </>
              )}
            </span>
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
