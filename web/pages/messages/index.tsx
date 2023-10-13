import { redirectIfLoggedOut } from 'web/lib/firebase/server-auth'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import {
  usePrivateMessageChannelIds,
  useOtherUserIdsInPrivateMessageChannelIds,
  useRealtimePrivateMessages,
  useHasUnseenPrivateMessage,
} from 'web/hooks/use-private-messages'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import Link from 'next/link'
import { useUsersInStore } from 'web/hooks/use-user-supabase'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { User } from 'common/user'
import { Content } from 'web/components/widgets/editor'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import clsx from 'clsx'
export const getServerSideProps = redirectIfLoggedOut('/')

export default function MessagesPage() {
  redirectIfLoggedOut('/')

  const currentUser = useUser()
  const isAuthed = useIsAuthorized()
  const channelIds = usePrivateMessageChannelIds(currentUser?.id, isAuthed)
  const channelIdsToUserIds = useOtherUserIdsInPrivateMessageChannelIds(
    currentUser?.id,
    isAuthed,
    channelIds
  )
  const users = useUsersInStore(Object.values(channelIdsToUserIds ?? {}))
  return (
    <Page trackPageView={'messages page'} className={'bg-canvas-0 p-2'}>
      <Title>Messages</Title>
      <Col className={'w-full gap-2 overflow-hidden'}>
        {currentUser &&
          channelIds.map((channelId) => {
            const userId = channelIdsToUserIds?.[channelId]
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
              <span className={'text-xs text-gray-400'}>
                {chat && <RelativeTimestamp time={chat.createdTime} />}
              </span>
            </Row>
            <Row>
              <span className={'text-sm text-gray-400'}>
                {chat && <Content content={chat.content} key={chat.id} />}
              </span>
            </Row>
          </Col>
          {unseen && (
            <div
              className={clsx(
                'text-ink-0 bg-primary-500 h-4 min-w-[15px] rounded-full p-[2px] text-center text-[10px] '
              )}
            />
          )}
        </Row>
      </Link>
    </>
  )
}
