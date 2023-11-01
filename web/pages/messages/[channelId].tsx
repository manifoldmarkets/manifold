import { Page } from 'web/components/layout/page'
import { useRouter } from 'next/router'
import {
  useOtherUserIdsInPrivateMessageChannelIds,
  useRealtimePrivateMessagesPolling,
  usePrivateMessageChannel,
} from 'web/hooks/use-private-messages'
import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { useEffect, useState, useMemo } from 'react'
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
import { ChatMessageItem } from 'web/components/chat-message'
import { CommentInputTextArea } from 'web/components/comments/comment-input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { DAY_MS, MINUTE_MS, YEAR_MS } from 'common/util/time'
import { run, Row as rowFor } from 'common/supabase/utils'
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
import { filterDefined } from 'common/util/array'
import { GiSpeakerOff } from 'react-icons/gi'
import toast from 'react-hot-toast'

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
    100
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

  const otherUsers = useUsersInStore(otherUserIds, maxUsers)
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

  // array of groups, where each group is an array of messages that are displayed as one
  const groupedMessages = useMemo(() => {
    // Group messages with createdTime within 2 minutes of each other.
    const tempGrouped: ChatMessage[][] = []
    forEach(messages, (message, i) => {
      if (i === 0 || message.visibility === 'system_status') {
        tempGrouped.push([message])
      } else {
        const prevMessage = messages[i - 1]
        const close =
          Math.abs(message.createdTime - prevMessage.createdTime) <
          2 * MINUTE_MS
        const creatorsMatch = message.userId === prevMessage.userId

        if (close && creatorsMatch) last(tempGrouped)?.push(message)
        else tempGrouped.push([message])
      }
    })

    return tempGrouped
  }, [messages.length])

  useEffect(() => {
    if (scrollToBottomRef)
      scrollToBottomRef.scrollIntoView({
        block: 'end',
      })
  }, [scrollToBottomRef])

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
    setTimeout(
      () =>
        scrollToBottomRef?.scrollIntoView({
          block: 'end',
        }),
      100
    )
  }

  return (
    <Col className=" px-2 xl:px-0">
      <Col className={''}>
        <Row className={'border-ink-200 items-center gap-1 border-b py-2'}>
          <BackButton />
          <MultipleOrSingleAvatars
            size="sm"
            spacing={0.5}
            startLeft={1}
            avatarUrls={remainingUsers?.map((user) => user.avatarUrl) ?? []}
            onClick={() => setShowUsers(true)}
          />
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
            items={[
              {
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
              },
            ]}
          />
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
        </Row>
      </Col>
      <Col
        className={clsx(
          'gap-1 overflow-y-auto py-2 ',
          'max-h-[calc(100vh-216px)] min-h-[calc(100vh-216px)]',
          'lg:max-h-[calc(100vh-184px)] lg:min-h-[calc(100vh-184px)]'
        )}
      >
        {realtimeMessages === undefined ? (
          <LoadingIndicator />
        ) : (
          groupedMessages.map((messages, i) => {
            return (
              <ChatMessageItem
                key={messages[0].id}
                chats={messages}
                currentUser={user}
                otherUser={otherUsers?.find(
                  (user) => user.id === messages[0].userId
                )}
                beforeSameUser={
                  groupedMessages[i + 1]
                    ? groupedMessages[i + 1][0].userId === messages[0].userId
                    : false
                }
                firstOfUser={
                  groupedMessages[i - 1]
                    ? groupedMessages[i - 1][0].userId !== messages[0].userId
                    : true
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
      <div className="bg-canvas-50 sticky bottom-[56px] flex w-full justify-start gap-2 lg:bottom-0">
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
