import { Page } from 'web/components/layout/page'
import { useRouter } from 'next/router'
import {
  useOtherUserIdsInPrivateMessageChannelIds,
  usePrivateMessageChannelIds,
  useRealtimePrivateMessagesPolling,
} from 'web/hooks/use-private-messages'
import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { useEffect, useState, useMemo } from 'react'
import { track } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'
import { first, forEach, last } from 'lodash'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { ChatMessage } from 'common/chat-message'
import { useTextEditor } from 'web/components/widgets/editor'
import { sendUserPrivateMessage } from 'web/lib/firebase/api'
import { ChatMessageItem } from 'web/components/chat-message'
import { CommentInputTextArea } from 'web/components/comments/comment-input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { MINUTE_MS } from 'common/util/time'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useUsersInStore } from 'web/hooks/use-user-supabase'
import { BackButton } from 'web/components/contract/back-button'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { Avatar } from 'web/components/widgets/avatar'

export default function PrivateMessagesPage() {
  useRedirectIfSignedOut()
  const router = useRouter()
  const user = useUser()
  const isAuthed = useIsAuthorized()
  const { channelId } = router.query as { channelId: string }
  const channelIds = usePrivateMessageChannelIds(user?.id, isAuthed)
  const loaded = isAuthed && channelIds !== undefined && channelId

  return (
    <Page trackPageView={'private messages page'}>
      {user && loaded && channelIds.includes(parseInt(channelId)) ? (
        <PrivateChat channelId={parseInt(channelId)} user={user} />
      ) : (
        <LoadingIndicator />
      )}
    </Page>
  )
}

export const PrivateChat = (props: { user: User; channelId: number }) => {
  const { user, channelId } = props
  const [visible, setVisible] = useState(false)
  const realtimeMessages = useRealtimePrivateMessagesPolling(
    channelId,
    true,
    100
  )
  const otherUserFromMessages = (realtimeMessages ?? [])
    .filter((message) => message.userId !== user.id)
    .map((message) => message.userId)
  const otherUserFromChannel = useOtherUserIdsInPrivateMessageChannelIds(
    user.id,
    true,
    [channelId]
  )
  const otherUser = first(
    useUsersInStore(
      otherUserFromMessages.length
        ? otherUserFromMessages
        : otherUserFromChannel?.[channelId]
        ? otherUserFromChannel?.[channelId]
        : []
    )
  )

  const messages = (realtimeMessages ?? []).reverse()
  const editor = useTextEditor({
    size: 'sm',
    placeholder: 'Send a message',
  })
  const { ref } = useIsVisible(() => setVisible(true), true)

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
      if (i === 0) {
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
    if (scrollToBottomRef && visible && realtimeMessages?.length)
      scrollToBottomRef.scrollIntoView()
  }, [scrollToBottomRef, realtimeMessages?.length, visible])

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
          <Avatar
            size="xs"
            avatarUrl={otherUser?.avatarUrl}
            className="mx-1"
            username={otherUser?.username}
          />
          <Link className={linkClass} href={`/${otherUser?.username ?? ''}`}>
            <span className={'!mb-0'}>{otherUser?.name ?? ''}</span>
          </Link>
        </Row>
      </Col>
      <div ref={ref} />
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
                ref={
                  i === groupedMessages.length - 1
                    ? setScrollToBottomRef
                    : undefined
                }
                otherUser={otherUser}
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
