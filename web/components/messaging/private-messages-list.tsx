import clsx from 'clsx'
import { parseJsonContentToText } from 'common/util/parse'
import Link from 'next/link'
import {
  usePrivateMessages,
  useSortedPrivateMessageMemberships,
  useUnseenPrivateMessageChannels,
} from 'web/hooks/use-private-messages'
import { useUser } from 'web/hooks/use-user'
import { useUsersInStore } from 'web/hooks/use-user-supabase'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { MultipleOrSingleAvatars } from '../multiple-or-single-avatars'
import { RelativeTimestamp } from '../relative-timestamp'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { BannedBadge } from '../widgets/user-link'
import NewMessageButton from './new-message-button'

// New component for each chat item
function ChatItem({
  channel,
  memberIds,
  userId,
  isUnseen,
}: {
  channel: any
  memberIds: string[]
  userId: string
  isUnseen: boolean
}) {
  const otherMemberIds = memberIds.filter((id) => id !== userId)
  const otherUsers = useUsersInStore(
    otherMemberIds,
    `${channel.channel_id}`,
    100
  )
  const messages = usePrivateMessages(channel.channel_id, 50, userId)
  const chat = messages?.[0]
  const numOthers = otherUsers?.length ?? 0
  const isBanned = otherUsers?.length == 1 && otherUsers[0].isBannedFromPosting

  // Check if everyone has left the channel (no other active members)
  const everyoneHasLeft = numOthers === 0 && chat

  // Determine if this was originally a 1-on-1 or group chat by checking message history
  const uniqueOtherSenders = messages
    ? [
        ...new Set(
          messages.filter((m) => m.userId !== userId).map((m) => m.userId)
        ),
      ].length
    : 0
  const wasOneOnOne = uniqueOtherSenders === 1

  return (
    <Link
      href={`/messages/${channel.channel_id}`}
      className={clsx(
        'hover:bg-canvas-0 rounded p-2 transition-colors',
        isUnseen && 'bg-primary-50 dark:bg-primary-900/10'
      )}
    >
      <Row className="items-center gap-3 rounded-md">
        <div className="relative">
          <MultipleOrSingleAvatars
            size="md"
            spacing={numOthers === 2 ? 0.3 : 0.15}
            startLeft={numOthers === 2 ? 2.2 : 1.2}
            avatars={otherUsers ?? []}
            className={numOthers > 1 ? '-ml-2' : ''}
          />
          {isUnseen && (
            <div className="bg-primary-500 border-canvas-50 absolute -right-1 -top-1 h-3 w-3 rounded-full border-2" />
          )}
        </div>
        <Col className="w-full">
          <Row className="items-center justify-between">
            <span className={clsx('font-semibold', isUnseen && 'font-bold')}>
              {everyoneHasLeft ? (
                <span className="text-ink-400 italic">
                  {wasOneOnOne
                    ? 'They left the chat'
                    : 'Everyone has left the chat'}
                </span>
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
              {isBanned && <BannedBadge />}
            </span>
            <span className="text-ink-400 dark:text-ink-500 text-xs">
              {chat && <RelativeTimestamp time={chat.createdTime} />}
            </span>
          </Row>
          <Row className="items-center justify-between gap-1">
            <span
              className={clsx(
                'line-clamp-1 h-5 text-sm',
                isUnseen
                  ? 'text-ink-700 dark:text-ink-400 font-medium'
                  : 'text-ink-500 dark:text-ink-600'
              )}
            >
              {chat && (
                <>
                  {chat.userId == userId && 'You: '}
                  {parseJsonContentToText(chat.content)}
                </>
              )}
            </span>
          </Row>
        </Col>
      </Row>
    </Link>
  )
}

export function PrivateMessagesList() {
  const user = useUser()
  const { channels, memberIdsByChannelId } = useSortedPrivateMessageMemberships(
    user?.id,
    100
  )
  const { unseenChannels } = useUnseenPrivateMessageChannels(false)
  const unseenChannelIds = new Set(unseenChannels.map((c) => c.channel_id))

  if (!channels) return <LoadingIndicator />

  return (
    <Col className="gap-2">
      <Row className="justify-end">
        <NewMessageButton />
      </Row>

      {channels.length === 0 ? (
        <div className="mt-2">You don't have any messages yet.</div>
      ) : (
        channels.map((channel) => (
          <ChatItem
            key={channel.channel_id}
            channel={channel}
            memberIds={memberIdsByChannelId[channel.channel_id] ?? []}
            userId={user?.id ?? ''}
            isUnseen={unseenChannelIds.has(channel.channel_id)}
          />
        ))
      )}
    </Col>
  )
}
