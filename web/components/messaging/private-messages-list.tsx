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
import { RestrictedBadge } from '../widgets/user-link'
import NewMessageButton from './new-message-button'

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
  const singleOtherUser = otherUsers?.length === 1 ? otherUsers[0] : null

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

  const messagePreview = chat ? parseJsonContentToText(chat.content) : ''

  return (
    <Link
      href={`/messages/${channel.channel_id}`}
      className={clsx(
        'group relative rounded-xl p-3 transition-all duration-150',
        isUnseen
          ? 'bg-primary-50 dark:bg-primary-900/15 hover:bg-primary-100 dark:hover:bg-primary-900/25'
          : 'hover:bg-canvas-50 dark:hover:bg-canvas-50/50'
      )}
    >
      <Row className="items-center gap-3">
        {/* Avatar section */}
        <div className="relative flex-shrink-0">
          <MultipleOrSingleAvatars
            size="md"
            spacing={numOthers === 2 ? 0.3 : 0.15}
            startLeft={numOthers === 2 ? 2.2 : 1.2}
            avatars={otherUsers ?? []}
            className={numOthers > 1 ? '-ml-2' : ''}
          />
          {isUnseen && (
            <div className="bg-primary-500 animate-in zoom-in absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-white duration-200 dark:ring-gray-900" />
          )}
        </div>

        {/* Content section */}
        <Col className="min-w-0 flex-1 gap-0.5">
          <Row className="items-center justify-between gap-2">
            <span
              className={clsx(
                'truncate text-[15px] transition-colors',
                isUnseen
                  ? 'text-ink-900 font-semibold'
                  : 'text-ink-800 group-hover:text-ink-900 font-medium'
              )}
            >
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
                    {otherUsers.length > 2 && (
                      <span className="text-ink-500 font-normal">
                        {' '}
                        +{otherUsers.length - 2}
                      </span>
                    )}
                  </span>
                )
              )}
              {singleOtherUser && <RestrictedBadge user={singleOtherUser} />}
            </span>
            <span
              className={clsx(
                'flex-shrink-0 text-xs',
                isUnseen
                  ? 'text-primary-600 dark:text-primary-400 font-medium'
                  : 'text-ink-400 dark:text-ink-500'
              )}
            >
              {chat && <RelativeTimestamp time={chat.createdTime} />}
            </span>
          </Row>

          <Row className="items-center gap-1.5">
            <span
              className={clsx(
                'line-clamp-1 text-sm',
                isUnseen
                  ? 'text-ink-700 dark:text-ink-400'
                  : 'text-ink-500 dark:text-ink-500'
              )}
            >
              {chat && (
                <>
                  {chat.userId === userId && (
                    <span className="text-ink-400">You: </span>
                  )}
                  {messagePreview || (
                    <span className="text-ink-400 italic">No message</span>
                  )}
                </>
              )}
            </span>
          </Row>
        </Col>

        {/* Hover indicator */}
        <div className="text-ink-300 opacity-0 transition-opacity group-hover:opacity-100">
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
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

  if (!channels) {
    return (
      <Col className="items-center justify-center py-12">
        <LoadingIndicator />
      </Col>
    )
  }

  return (
    <Col className="gap-1">
      {/* Header with new message button */}
      <Row className="mb-2 items-center justify-between">
        <div className="text-ink-500 text-sm font-medium">
          {channels.length > 0 && (
            <span>
              {channels.length} conversation{channels.length !== 1 && 's'}
              {unseenChannelIds.size > 0 && (
                <span className="text-primary-600 dark:text-primary-400 ml-1">
                  · {unseenChannelIds.size} unread
                </span>
              )}
            </span>
          )}
        </div>
        <NewMessageButton />
      </Row>

      {/* Messages list */}
      {channels.length === 0 ? (
        <Col className="items-center justify-center py-16">
          <div className="bg-canvas-50 dark:bg-canvas-50 mb-4 rounded-full p-4">
            <svg
              className="text-ink-300 h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h3 className="text-ink-700 mb-1 text-base font-medium">
            No messages yet
          </h3>
          <p className="text-ink-500 mb-4 text-center text-sm">
            Start a conversation with someone on Manifold
          </p>
        </Col>
      ) : (
        <Col className="-mx-1 gap-0.5">
          {channels.map((channel) => (
            <ChatItem
              key={channel.channel_id}
              channel={channel}
              memberIds={memberIdsByChannelId[channel.channel_id] ?? []}
              userId={user?.id ?? ''}
              isUnseen={unseenChannelIds.has(channel.channel_id)}
            />
          ))}
        </Col>
      )}
    </Col>
  )
}
