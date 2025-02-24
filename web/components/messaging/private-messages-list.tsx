import { useSortedPrivateMessageMemberships } from 'web/hooks/use-private-messages'
import { useUser } from 'web/hooks/use-user'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import Link from 'next/link'
import { Row } from '../layout/row'
import { RelativeTimestamp } from '../relative-timestamp'
import clsx from 'clsx'
import NewMessageButton from './new-message-button'
import { usePrivateMessages } from 'web/hooks/use-private-messages'
import { parseJsonContentToText } from 'common/util/parse'
import { MultipleOrSingleAvatars } from '../multiple-or-single-avatars'
import { BannedBadge } from '../widgets/user-link'
import { useUsersInStore } from 'web/hooks/use-user-supabase'

// New component for each chat item
function ChatItem({
  channel,
  memberIds,
  userId,
}: {
  channel: any
  memberIds: string[]
  userId: string
}) {
  const otherMemberIds = memberIds.filter((id) => id !== userId)
  const otherUsers = useUsersInStore(
    otherMemberIds,
    `${channel.channel_id}`,
    100
  )
  const messages = usePrivateMessages(channel.channel_id, 1, userId)
  const chat = messages?.[0]
  const numOthers = otherUsers?.length ?? 0
  const isBanned = otherUsers?.length == 1 && otherUsers[0].isBannedFromPosting

  return (
    <Link
      href={`/messages/${channel.channel_id}`}
      className="hover:bg-canvas-0 rounded p-2 transition-colors"
    >
      <Row className="items-center gap-3 rounded-md">
        <MultipleOrSingleAvatars
          size="md"
          spacing={numOthers === 2 ? 0.3 : 0.15}
          startLeft={numOthers === 2 ? 2.2 : 1.2}
          avatars={otherUsers ?? []}
          className={numOthers > 1 ? '-ml-2' : ''}
        />
        <Col className="w-full">
          <Row className="items-center justify-between">
            <span className="font-semibold">
              {otherUsers && (
                <span>
                  {otherUsers
                    .map((user) => user.name.split(' ')[0].trim())
                    .slice(0, 2)
                    .join(', ')}
                  {otherUsers.length > 2 && ` & ${otherUsers.length - 2} more`}
                </span>
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
                'text-ink-500 dark:text-ink-600'
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
          />
        ))
      )}
    </Col>
  )
}
