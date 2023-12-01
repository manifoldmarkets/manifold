import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import {
  useNonEmptyPrivateMessageChannels,
  useOtherUserIdsInPrivateMessageChannelIds,
} from 'web/hooks/use-private-messages'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import NewMessageButton from 'web/components/messaging/new-message-button'
import { Col } from 'web/components/layout/col'
import { MessageChannelRow } from 'web/pages/messages'
import { LovePage } from 'love/components/love-page'

// For some reason this doesn't work just by importing <MessagesContent/>
export default function MessagesPage() {
  return (
    <LovePage trackPageView={'messages page'} className={'p-2'}>
      <MessagesContent />
    </LovePage>
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
