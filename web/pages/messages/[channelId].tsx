import { Page } from 'web/components/layout/page'
import { useRouter } from 'next/router'
import {
  useMessagesCount,
  useOtherUserIdsInPrivateMessageChannelIds,
  usePrivateMessageChannel,
  useRealtimePrivateMessagesPolling,
} from 'web/hooks/use-private-messages'
import { Col } from 'web/components/layout/col'
import { MANIFOLD_LOVE_LOGO, User } from 'common/user'
import { useEffect, useState } from 'react'
import { track } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'
import { uniq } from 'lodash'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { useTextEditor } from 'web/components/widgets/editor'
import {
  leavePrivateMessageChannel,
  sendUserPrivateMessage,
  updatePrivateMessageChannel,
} from 'web/lib/firebase/api'
import {
  ChatMessageItem,
  SystemChatMessageItem,
} from 'web/components/chat-message'
import { CommentInputTextArea } from 'web/components/comments/comment-input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { DAY_MS, YEAR_MS } from 'common/util/time'
import { Row as rowFor, run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { useUsersInStore } from 'web/hooks/use-user-supabase'
import { BackButton } from 'web/components/contract/back-button'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { MultipleOrSingleAvatars } from 'web/components/multiple-or-single-avatars'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import {
  BannedBadge,
  UserAvatarAndBadge,
} from 'web/components/widgets/user-link'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { DotsVerticalIcon } from '@heroicons/react/solid'
import { FaUserFriends, FaUserMinus } from 'react-icons/fa'
import { buildArray, filterDefined } from 'common/util/array'
import { GiSpeakerOff } from 'react-icons/gi'
import toast from 'react-hot-toast'
import { Avatar } from 'web/components/widgets/avatar'
import { getNativePlatform } from 'web/lib/native/is-native'
import { ReplyToUserInfo } from 'web/components/feed/feed-comments'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import {
  useGroupedMessages,
  usePaginatedScrollingMessages,
} from 'web/lib/supabase/chat-messages'

export default function PrivateMessagesPage() {
  return (
    <Page trackPageView={'private messages page'}>
      <PrivateMessagesContent />
    </Page>
  )
}

export function PrivateMessagesContent() {
  useRedirectIfSignedOut()
  const router = useRouter()
  const user = useUser()
  const isAuthed = useIsAuthorized()
  const { channelId } = router.query as { channelId: string }
  const accessToChannel = usePrivateMessageChannel(
    user?.id,
    isAuthed,
    channelId
  )
  const loaded = isAuthed && accessToChannel !== undefined && channelId

  return (
    <>
      {user && loaded && accessToChannel?.id == parseInt(channelId) ? (
        <PrivateChat channel={accessToChannel} user={user} />
      ) : (
        <LoadingIndicator />
      )}
    </>
  )
}

export const PrivateChat = (props: {
  user: User
  channel: rowFor<'private_user_message_channels'>
}) => {
  const { user, channel } = props
  const channelId = channel.id
  const isSafari =
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
    getNativePlatform().platform === 'ios'
  const isMobile = useIsMobile()

  const totalMessagesToLoad = 500
  const realtimeMessages = useRealtimePrivateMessagesPolling(
    channelId,
    true,
    100,
    totalMessagesToLoad
  )

  const totalMessages = useMessagesCount(true, channelId)

  const [showUsers, setShowUsers] = useState(false)
  const channelMemberships = useOtherUserIdsInPrivateMessageChannelIds(
    user.id,
    true,
    [channel]
  )
  const maxUsersToGet = 100
  const messageUserIds = uniq(
    (realtimeMessages ?? [])
      .filter((message) => message.userId !== user.id)
      .map((message) => message.userId)
  )
  const membershipUserIds =
    channelMemberships?.[channelId]?.map((m) => m.user_id) ?? []

  // Prioritize getting users that have messages in the channel
  const otherUserIds = messageUserIds.concat(
    membershipUserIds
      .filter((userId) => !messageUserIds.includes(userId))
      .slice(0, maxUsersToGet - messageUserIds.length)
  )

  const usersThatLeft = filterDefined(
    channelMemberships?.[channelId]
      ?.filter((membership) => membership.status === 'left')
      .map((membership) => membership.user_id) ?? []
  )

  // Note: we may have messages from users not in the channel, e.g. a system message from manifold
  const otherUsers = useUsersInStore(
    otherUserIds,
    `${channelId}`,
    maxUsersToGet
  )
  const remainingUsers = filterDefined(
    otherUsers?.filter((user) => !usersThatLeft.includes(user.id)) ?? []
  )
  const members = filterDefined(
    otherUsers?.filter((user) => membershipUserIds.includes(user.id)) ?? []
  )
  const router = useRouter()

  const { topVisibleRef, showMessages, messages, innerDiv, outerDiv } =
    usePaginatedScrollingMessages(realtimeMessages, 200, user?.id)

  const notShowingMessages = realtimeMessages
    ? Math.max(0, totalMessages - messages.length)
    : 0
  const editor = useTextEditor({
    key: `private-message-${channelId}-${user.id}`,
    size: 'sm',
    placeholder: 'Send a message',
  })

  useEffect(() => {
    setAsSeen(user, channelId)
  }, [messages.length])

  const [isSubmitting, setIsSubmitting] = useState(false)

  const groupedMessages = useGroupedMessages(messages)

  async function submitMessage() {
    if (!user) {
      track('sign in to comment')
      return await firebaseLogin()
    }
    if (!editor || editor.isEmpty || isSubmitting || !channelId) return
    setIsSubmitting(true)

    await sendUserPrivateMessage({
      channelId,
      content: editor.getJSON(),
    })
      .then(() => {
        editor.commands.clearContent()
        editor.commands.focus()
      })
      .catch((e) => {
        toast.error(e.message)
        console.error(e)
      })
    setIsSubmitting(false)
  }

  const heightFromTop = 200

  const [replyToUserInfo, setReplyToUserInfo] = useState<ReplyToUserInfo>()

  return (
    <Col className=" w-full">
      <Row
        className={
          'border-ink-200 bg-canvas-50 items-center gap-1 border-b py-2'
        }
      >
        <BackButton />
        {channel.title ? (
          <Avatar noLink={true} avatarUrl={MANIFOLD_LOVE_LOGO} size={'md'} />
        ) : (
          <MultipleOrSingleAvatars
            size="sm"
            spacing={0.5}
            startLeft={1}
            avatars={members ?? []}
            onClick={() => setShowUsers(true)}
          />
        )}
        {channel.title ? (
          <span className={'ml-1 font-semibold'}>{channel.title}</span>
        ) : (
          members && (
            <span
              className={'ml-1 cursor-pointer hover:underline'}
              onClick={() => setShowUsers(true)}
            >
              {members
                .map((user) => user.name.split(' ')[0].trim())
                .slice(0, 2)
                .join(', ')}
              {members.length > 2 && ` & ${members.length - 2} more`}
              {usersThatLeft.length > 0 && ` (${usersThatLeft.length} left)`}
            </span>
          )
        )}
        {members?.length == 1 && members[0].isBannedFromPosting && (
          <BannedBadge />
        )}
        <DropdownMenu
          className={'ml-auto'}
          menuWidth={'w-44'}
          icon={<DotsVerticalIcon className="h-5 w-5" />}
          items={buildArray(
            !channel.title && {
              icon: <FaUserFriends className={'h-5 w-5'} />,
              name: 'See members',
              onClick: () => {
                setShowUsers(true)
              },
            },
            {
              icon: <GiSpeakerOff className="h-5 w-5" />,
              name: 'Mute 1 day',
              onClick: async () => {
                await toast.promise(
                  updatePrivateMessageChannel({
                    channelId: channelId,
                    notifyAfterTime: Date.now() + DAY_MS,
                  }),
                  {
                    loading: 'Muting for 1 day...',
                    success: 'Muted for 1 day',
                    error: 'Failed to mute',
                  }
                )
              },
            },
            {
              icon: <GiSpeakerOff className="h-5 w-5" />,
              name: 'Mute forever',
              onClick: async () => {
                await toast.promise(
                  updatePrivateMessageChannel({
                    channelId: channelId,
                    notifyAfterTime: Date.now() + 100 * YEAR_MS,
                  }),
                  {
                    loading: 'Muting forever...',
                    success: 'Muted forever',
                    error: 'Failed to mute',
                  }
                )
              },
            },
            {
              icon: <FaUserMinus className="h-5 w-5" />,
              name: 'Leave chat',
              onClick: async () => {
                await leavePrivateMessageChannel({ channelId: channelId })
                router.push('/messages')
              },
            }
          )}
        />
        {showUsers && (
          <Modal open={showUsers} setOpen={setShowUsers}>
            <Col className={clsx(MODAL_CLASS)}>
              {members?.map((user) => (
                <Row
                  key={user.id}
                  className={'w-full items-center justify-start gap-2'}
                >
                  <UserAvatarAndBadge user={user} />
                  {channelMemberships?.[channelId].map(
                    (membership) =>
                      membership.user_id === user.id &&
                      membership.status === 'left' && (
                        <span
                          key={membership.user_id + 'status'}
                          className={'text-ink-500 text-sm'}
                        >
                          (Left)
                        </span>
                      )
                  )}
                </Row>
              ))}
            </Col>
          </Modal>
        )}
      </Row>
      <Col className="relative h-[calc(100dvh-213px)]  lg:h-[calc(100dvh-184px)] xl:px-0">
        <div
          ref={outerDiv}
          className="relative h-full overflow-y-auto"
          style={{
            transform: isSafari ? 'translate3d(0, 0, 0)' : 'none',
          }}
        >
          <div
            className="relative px-1 pb-4 pt-1 transition-all duration-100"
            ref={innerDiv}
            style={{
              transform: isSafari ? 'translate3d(0, 0, 0)' : 'none',
              opacity: showMessages ? 1 : 0,
            }}
          >
            {realtimeMessages === undefined ? (
              <LoadingIndicator />
            ) : (
              <>
                {notShowingMessages ? (
                  <Row className=" text-ink-500 items-center justify-center p-2 text-xs italic">
                    Not showing {notShowingMessages} older messages
                  </Row>
                ) : null}
                <div
                  className={'absolute h-1 '}
                  ref={topVisibleRef}
                  style={{ top: heightFromTop }}
                />
                {groupedMessages.map((messages, i) => {
                  const firstMessage = messages[0]
                  if (firstMessage.visibility === 'system_status') {
                    return (
                      <SystemChatMessageItem
                        key={firstMessage.id}
                        chats={messages}
                        otherUsers={otherUsers
                          ?.concat([user])
                          .filter((user) =>
                            messages.some((m) => m.userId === user.id)
                          )}
                      />
                    )
                  }
                  const otherUser = otherUsers?.find(
                    (user) => user.id === firstMessage.userId
                  )
                  return (
                    <ChatMessageItem
                      key={firstMessage.id}
                      chats={messages}
                      currentUser={user}
                      otherUser={otherUser}
                      beforeSameUser={
                        groupedMessages[i + 1]?.[0].userId ===
                        firstMessage.userId
                      }
                      firstOfUser={
                        groupedMessages[i - 1]?.[0].userId !==
                        firstMessage.userId
                      }
                      onReplyClick={
                        remainingUsers.length > 1
                          ? (chat) =>
                              setReplyToUserInfo({
                                id: chat.userId,
                                username: otherUser?.username ?? '',
                              })
                          : undefined
                      }
                    />
                  )
                })}
              </>
            )}
            {realtimeMessages && messages.length === 0 && (
              <div className="text-ink-500 dark:text-ink-600 p-2">
                No messages yet. Say something why don't ya?
              </div>
            )}
          </div>
        </div>
      </Col>
      <CommentInputTextArea
        editor={editor}
        user={user}
        submit={submitMessage}
        isSubmitting={isSubmitting}
        submitOnEnter={!isMobile}
        replyTo={replyToUserInfo}
      />
    </Col>
  )
}

const setAsSeen = async (user: User, privatechannelId: number) => {
  return run(
    db.from('private_user_seen_message_channels').insert({
      user_id: user.id,
      channel_id: privatechannelId,
    })
  )
}
