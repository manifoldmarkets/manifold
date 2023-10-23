import { first } from 'lodash'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import NewMessageButton from 'web/components/messaging/new-message-button'
import { Title } from 'web/components/widgets/title'
import {
  useNonEmptyPrivateMessageChannelIds,
  useOtherUserIdsInPrivateMessageChannelIds,
} from 'web/hooks/use-private-messages'
import { useIsAuthorized, usePrivateUser, useUser } from 'web/hooks/use-user'
import { useUsersInStore } from 'web/hooks/use-user-supabase'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { MessageChannelRow } from 'web/pages/messages'
import { LovePage } from 'love/components/love-page'

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
    <LovePage trackPageView={'messages page'} className={'p-2'}>
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
    </LovePage>
  )
}
