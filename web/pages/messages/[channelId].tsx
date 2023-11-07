import { Page } from 'web/components/layout/page'
import { useRouter } from 'next/router'
import {
  useOtherUserIdsInPrivateMessageChannelIds,
  usePrivateMessageChannel,
  useRealtimePrivateMessagesPolling,
} from 'web/hooks/use-private-messages'
import { Col } from 'web/components/layout/col'
import { MANIFOLD_LOVE_LOGO, User } from 'common/user'
import { useEffect, useMemo, useState } from 'react'
import { track } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'
import { forEach, last, uniq } from 'lodash'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { ChatMessage } from 'common/chat-message'
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
import { DAY_MS, HOUR_MS, MINUTE_MS, YEAR_MS } from 'common/util/time'
import { Row as rowFor, run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { useUsersInStore } from 'web/hooks/use-user-supabase'
import { BackButton } from 'web/components/contract/back-button'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { MultipleOrSingleAvatars } from 'web/components/multiple-or-single-avatars'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { DotsVerticalIcon } from '@heroicons/react/solid'
import { FaUserFriends, FaUserMinus } from 'react-icons/fa'
import { buildArray, filterDefined } from 'common/util/array'
import { GiSpeakerOff } from 'react-icons/gi'
import toast from 'react-hot-toast'
import { Avatar } from 'web/components/widgets/avatar'
import { richTextToString } from 'common/util/parse'

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
  const realtimeMessages = useRealtimePrivateMessagesPolling(
    channelId,
    true,
    100,
    20
  )
  const [showUsers, setShowUsers] = useState(false)
  const otherUsersFromChannel = useOtherUserIdsInPrivateMessageChannelIds(
    user.id,
    true,
    [channel]
  )
  const maxUsers = 100
  const userIdsFromMessages = uniq(
    (realtimeMessages ?? [])
      .filter((message) => message.userId !== user.id)
      .map((message) => message.userId)
  )
  const userIdsFromMemberships = (
    otherUsersFromChannel?.[channelId]?.map((m) => m.user_id) ?? []
  )
    .filter((userId) => !userIdsFromMessages.includes(userId))
    .slice(0, maxUsers - userIdsFromMessages.length)
  const otherUserIds = userIdsFromMessages.concat(userIdsFromMemberships)

  const usersThatLeft = filterDefined(
    otherUsersFromChannel?.[channelId]
      ?.filter((membership) => membership.status === 'left')
      .map((membership) => membership.user_id) ?? []
  )

  const otherUsers = useUsersInStore(otherUserIds, `${channelId}`, maxUsers)
  const remainingUsers = filterDefined(
    otherUsers?.filter((user) => !usersThatLeft.includes(user.id)) ?? []
  )
  const router = useRouter()

  const messages = (realtimeMessages ?? []).reverse()
  const editor = useTextEditor({
    size: 'sm',
    placeholder: 'Send a message',
  })

  useEffect(() => {
    setAsSeen(user, channelId)
  }, [messages.length])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [scrollToBottomRef, setScrollToBottomRef] =
    useState<HTMLDivElement | null>(null)

  const groupedMessages = useMemo(() => {
    // Group messages created within a short time of each other.
    const tempGrouped: ChatMessage[][] = []
    let systemStatusGroup: ChatMessage[] = []

    forEach(messages, (message, i) => {
      const isSystemStatus = message.visibility === 'system_status'
      if (
        isSystemStatus &&
        richTextToString(message.content).includes('left the chat')
      )
        return

      if (i === 0) {
        if (isSystemStatus) systemStatusGroup.push(message)
        else tempGrouped.push([message])
      } else {
        const prevMessage = messages[i - 1]
        const timeDifference = Math.abs(
          message.createdTime - prevMessage.createdTime
        )
        const creatorsMatch = message.userId === prevMessage.userId
        const isPrevSystemStatus = prevMessage.visibility === 'system_status'

        if (isSystemStatus) {
          // Check if the current message should be grouped with the previous system_status message(s)
          if (isPrevSystemStatus && timeDifference < 4 * HOUR_MS) {
            systemStatusGroup.push(message)
          } else {
            if (systemStatusGroup.length > 0) {
              tempGrouped.push([...systemStatusGroup])
              systemStatusGroup = []
            }
            systemStatusGroup.push(message)
          }
        } else if (
          timeDifference < 2 * MINUTE_MS &&
          creatorsMatch &&
          !isPrevSystemStatus
        ) {
          last(tempGrouped)?.push(message)
        } else {
          if (systemStatusGroup.length > 0) {
            tempGrouped.push([...systemStatusGroup])
            systemStatusGroup = []
          }
          tempGrouped.push([message])
        }
      }
    })

    if (systemStatusGroup.length > 0) tempGrouped.push(systemStatusGroup)

    return tempGrouped
  }, [messages.length])

  useEffect(() => {
    scrollToBottomRef?.scrollIntoView({
      block: 'end',
    })
  }, [scrollToBottomRef])

  useEffect(() => {
    if (last(messages)?.userId === user.id)
      scrollToBottomRef?.scrollIntoView({
        block: 'end',
      })
  }, [messages?.length])

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
    }).catch((e) => {
      console.error(e)
      setIsSubmitting(false)
    })
    editor.commands.clearContent()
    setIsSubmitting(false)
    editor?.commands?.focus()
  }

  return (
    <Col className=" px-2 xl:px-0">
      <Col className={''}>
        <Row className={'border-ink-200 items-center gap-1 border-b py-2'}>
          <BackButton />
          {channel.title ? (
            <Avatar noLink={true} avatarUrl={MANIFOLD_LOVE_LOGO} size={'md'} />
          ) : (
            <MultipleOrSingleAvatars
              size="sm"
              spacing={0.5}
              startLeft={1}
              avatarUrls={remainingUsers?.map((user) => user.avatarUrl) ?? []}
              onClick={() => setShowUsers(true)}
            />
          )}
          {channel.title ? (
            <span className={'ml-1 font-semibold'}>{channel.title}</span>
          ) : (
            remainingUsers && (
              <span
                className={'ml-1 cursor-pointer hover:underline'}
                onClick={() => setShowUsers(true)}
              >
                {remainingUsers
                  .map((user) => user.name.split(' ')[0].trim())
                  .slice(0, 2)
                  .join(', ')}
                {remainingUsers.length > 2 &&
                  ` & ${remainingUsers.length - 2} more`}
                {usersThatLeft.length > 0 && ` (${usersThatLeft.length} left)`}
              </span>
            )
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
                {otherUsers?.map((user) => (
                  <Row
                    key={user.id}
                    className={'w-full items-center justify-start gap-2'}
                  >
                    <UserAvatarAndBadge
                      name={user.name}
                      username={user.username}
                      avatarUrl={user.avatarUrl}
                    />
                    {otherUsersFromChannel?.[channelId].map(
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
      </Col>
      <Col
        className={clsx(
          'gap-2 overflow-y-auto py-2 ',
          'max-h-[calc(100vh - env(safe-area-inset-bottom))] min-h-[calc(100vh - env(safe-area-inset-bottom))]',
          'lg:max-h-[calc(100vh-184px)] lg:min-h-[calc(100vh-184px)]'
        )}
      >
        {realtimeMessages === undefined ? (
          <LoadingIndicator />
        ) : (
          groupedMessages.map((messages, i) => {
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
            return (
              <ChatMessageItem
                key={firstMessage.id}
                chats={messages}
                currentUser={user}
                otherUser={otherUsers?.find(
                  (user) => user.id === firstMessage.userId
                )}
                beforeSameUser={
                  groupedMessages[i + 1]?.[0].userId === firstMessage.userId
                }
                firstOfUser={
                  groupedMessages[i - 1]?.[0].userId !== firstMessage.userId
                }
              />
            )
          })
        )}
        {messages.length === 0 && (
          <div className="text-ink-500 dark:text-ink-600 p-2">
            No messages yet. Say something why don't ya?
          </div>
        )}
        {groupedMessages.length > 0 && <div ref={setScrollToBottomRef} />}
      </Col>
      <div className="bg-canvas-50 sticky bottom-[58px] flex w-full justify-start gap-2 lg:bottom-0">
        <CommentInputTextArea
          editor={editor}
          user={user}
          submit={submitMessage}
          isSubmitting={isSubmitting}
          submitOnEnter={true}
        />
      </div>
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
