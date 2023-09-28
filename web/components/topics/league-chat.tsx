import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { useEffect, useState, useMemo } from 'react'
import { track } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'
import { forEach, last } from 'lodash'
import { useWindowSize } from 'web/hooks/use-window-size'
import { useIsAuthorized } from 'web/hooks/use-user'
import { ChatMessage } from 'common/chat-message'
import { useTextEditor } from 'web/components/widgets/editor'
import { createChatMessage } from 'web/lib/firebase/api'
import { ChatMessageItem } from 'web/components/chat-message'
import { Avatar } from 'web/components/widgets/avatar'
import { CommentInputTextArea } from 'web/components/comments/comment-input'
import { useRealtimeChatsOnLeague } from 'web/hooks/use-chats'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { MINUTE_MS } from 'common/util/time'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { useIsVisible } from 'web/hooks/use-is-visible'

export const LeagueChat = (props: {
  user: User | null | undefined
  channelId: string
  offsetTop?: number
}) => {
  const { user, offsetTop, channelId } = props
  const [visible, setVisible] = useState(false)
  const authed = useIsAuthorized()
  const realtimeMessages = useRealtimeChatsOnLeague(channelId, 100)
  const messages = realtimeMessages ?? []
  const editor = useTextEditor({
    size: 'sm',
    placeholder: 'Send a message',
  })
  const { ref } = useIsVisible(() => {
    user && setAsSeen(user, channelId)
    setVisible(true)
  }, true)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [scrollToBottomRef, setScrollToBottomRef] =
    useState<HTMLDivElement | null>(null)
  const [scrollerRef, setScrollerRef] = useState<HTMLDivElement | null>(null)
  const [replyToUser, setReplyToUser] = useState<any>()

  const { height } = useWindowSize()
  const isMobile = useIsMobile()
  // Subtract bottom bar when it's showing (less than lg screen)
  const bottomBarHeight = isMobile ? 60 : 0
  const remainingHeight = (height ?? 0) - (offsetTop || 320) - bottomBarHeight
  useEffect(() => {
    if (isMobile) focusInput()
  }, [isMobile])

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
    if (scrollToBottomRef && scrollerRef && visible && realtimeMessages?.length)
      scrollerRef.scrollTo({ top: scrollToBottomRef.offsetTop || 0 })
  }, [
    scrollToBottomRef,
    scrollerRef,
    JSON.stringify(realtimeMessages),
    visible,
  ])

  function onReplyClick(message: ChatMessage) {
    setReplyToUser({ id: message.userId, username: message.userUsername })
  }

  async function submitMessage() {
    if (!user) {
      track('sign in to comment')
      return await firebaseLogin()
    }
    if (!editor || editor.isEmpty || isSubmitting || !channelId || !authed)
      return
    setIsSubmitting(true)
    await createChatMessage({
      channelId,
      content: editor.getJSON(),
    })
    editor.commands.clearContent()
    setIsSubmitting(false)
    setReplyToUser(undefined)
    focusInput()
  }
  function focusInput() {
    editor?.commands.focus()
  }

  return (
    <>
      <div ref={ref} className={'h-1'} />
      <Col style={{ height: remainingHeight }}>
        <Col
          ref={setScrollerRef}
          className={
            'h-full w-full space-y-1 overflow-x-hidden overflow-y-scroll pt-1'
          }
        >
          {realtimeMessages === undefined ? (
            <LoadingIndicator />
          ) : (
            groupedMessages.map((messages, i) => (
              <ChatMessageItem
                key={messages[0].id}
                chats={messages}
                user={user}
                onReplyClick={onReplyClick}
                ref={
                  i === groupedMessages.length - 1
                    ? setScrollToBottomRef
                    : undefined
                }
              />
            ))
          )}
          {messages.length === 0 && (
            <div className="p-2 text-gray-500">
              No messages yet. Say something why don't ya?
            </div>
          )}
        </Col>
        {user && (
          <div className="flex w-full justify-start gap-2 p-2">
            <div className="mt-1 hidden sm:block">
              <Avatar
                username={user?.username}
                avatarUrl={user?.avatarUrl}
                size={'sm'}
              />
            </div>
            <div className={'flex-1'}>
              <CommentInputTextArea
                editor={editor}
                user={user}
                submit={submitMessage}
                isSubmitting={isSubmitting}
                size={'xs'}
                replyTo={replyToUser}
                submitOnEnter={true}
              />
            </div>
          </div>
        )}
      </Col>
    </>
  )
}

const setAsSeen = async (user: User, leagueChannelId: string) =>
  run(
    db.from('user_seen_chats').insert({
      user_id: user.id,
      channel_id: leagueChannelId,
    })
  )
