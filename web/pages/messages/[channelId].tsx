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
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { richTextToString } from 'common/util/parse'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { getNativePlatform } from 'web/lib/native/is-native'
import { ReplyToUserInfo } from 'web/components/feed/feed-comments'

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
const systemStatusType = (message: ChatMessage) => {
  const chatContent = richTextToString(message.content)
  return chatContent.includes('left the chat')
    ? 'left'
    : chatContent.includes('joined the chat')
    ? 'joined'
    : 'other'
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

  const totalMessagesToLoad = 500
  const realtimeMessages = useRealtimePrivateMessagesPolling(
    channelId,
    true,
    100,
    totalMessagesToLoad
  )

  const [page, setPage] = useState(1)
  const scrollToOldTop = useRef(false)

  const totalMessages = useMessagesCount(true, channelId)
  const messagesPerPage = 50

  const [showUsers, setShowUsers] = useState(false)
  const channelMemberships = useOtherUserIdsInPrivateMessageChannelIds(
    user.id,
    true,
    [channel]
  )
  const initialScroll = useRef(realtimeMessages === undefined)
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
  const messages = useMemo(
    () => (realtimeMessages ?? []).slice(0, messagesPerPage * page).reverse(),
    [realtimeMessages?.length, page]
  )

  const notShowingMessages = realtimeMessages
    ? Math.max(0, totalMessages - messages.length)
    : 0
  const editor = useTextEditor({
    size: 'sm',
    placeholder: 'Send a message',
  })

  useEffect(() => {
    setAsSeen(user, channelId)
  }, [messages.length])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const outerDiv = useRef<HTMLDivElement | null>(null)
  const innerDiv = useRef<HTMLDivElement | null>(null)

  const [prevInnerDivHeight, setPrevInnerDivHeight] = useState<number>()

  const [showMessages, setShowMessages] = useState(false)

  const groupedMessages = useMemo(() => {
    // Group messages created within a short time of each other.
    const tempGrouped: ChatMessage[][] = []
    let systemStatusGroup: ChatMessage[] = []

    forEach(messages, (message, i) => {
      const isSystemStatus = message.visibility === 'system_status'
      const systemType = systemStatusType(message)
      if (isSystemStatus && systemType === 'left') return

      if (i === 0) {
        if (isSystemStatus) systemStatusGroup.push(message)
        else tempGrouped.push([message])
      } else {
        const prevMessage = messages[i - 1]
        const timeDifference = Math.abs(
          message.createdTime - prevMessage.createdTime
        )
        const creatorsMatch = message.userId === prevMessage.userId
        const isMatchingPrevSystemStatus =
          prevMessage.visibility === 'system_status' &&
          systemStatusType(prevMessage) === systemType

        if (isSystemStatus) {
          // Check if the current message should be grouped with the previous system_status message(s)
          if (isMatchingPrevSystemStatus && timeDifference < 4 * HOUR_MS) {
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
          !isMatchingPrevSystemStatus
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
  }, [messages])

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

  useEffect(() => {
    const outerDivHeight = outerDiv?.current?.clientHeight ?? 0
    const innerDivHeight = innerDiv?.current?.clientHeight ?? 0
    const outerDivScrollTop = outerDiv?.current?.scrollTop ?? 0
    if (
      (!prevInnerDivHeight ||
        outerDivScrollTop === prevInnerDivHeight - outerDivHeight ||
        initialScroll.current) &&
      realtimeMessages
    ) {
      // Initial load, scroll to bottom
      outerDiv?.current?.scrollTo({
        top: innerDivHeight! - outerDivHeight!,
        left: 0,
        behavior: prevInnerDivHeight ? 'smooth' : 'auto',
      })
      setShowMessages(true)
      initialScroll.current = false
    } else if (scrollToOldTop.current) {
      // Loaded more messages, scroll to old top
      const height = innerDivHeight! - prevInnerDivHeight! + heightFromTop
      outerDiv?.current?.scrollTo({
        top: height,
        left: 0,
        behavior: 'auto',
      })
      scrollToOldTop.current = false
    } else if (last(messages)?.userId === user.id) {
      // Sent a message, scroll to bottom
      outerDiv?.current?.scrollTo({
        top: innerDivHeight! - outerDivHeight!,
        left: 0,
        behavior: 'smooth',
      })
    }

    setPrevInnerDivHeight(innerDivHeight)
  }, [messages])

  const heightFromTop = 200
  const { ref: topVisibleRef } = useIsVisible(() => {
    scrollToOldTop.current = true
    setPage(page + 1)
  })
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
            avatarUrls={members?.map((user) => user.avatarUrl) ?? []}
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
          className={clsx('relative h-full overflow-y-scroll ')}
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
        submitOnEnter={true}
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
