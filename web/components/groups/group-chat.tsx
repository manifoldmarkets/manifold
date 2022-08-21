import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { PrivateUser, User } from 'common/user'
import React, { useEffect, memo, useState, useMemo } from 'react'
import { Avatar } from 'web/components/avatar'
import { Group } from 'common/group'
import { Comment, GroupComment } from 'common/comment'
import { createCommentOnGroup } from 'web/lib/firebase/comments'
import { CommentInputTextArea } from 'web/components/feed/feed-comments'
import { track } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'
import { useRouter } from 'next/router'
import clsx from 'clsx'
import { UserLink } from 'web/components/user-page'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { CommentTipMap, CommentTips } from 'web/hooks/use-tip-txns'
import { Tipper } from 'web/components/tipper'
import { sum } from 'lodash'
import { formatMoney } from 'common/util/format'
import { useWindowSize } from 'web/hooks/use-window-size'
import { Content, useTextEditor } from 'web/components/editor'
import { useUnseenPreferredNotifications } from 'web/hooks/use-notifications'
import { ChevronDownIcon, UsersIcon } from '@heroicons/react/outline'
import { setNotificationsAsSeen } from 'web/pages/notifications'
import { usePrivateUser } from 'web/hooks/use-user'

export function GroupChat(props: {
  messages: GroupComment[]
  user: User | null | undefined
  group: Group
  tips: CommentTipMap
}) {
  const { messages, user, group, tips } = props

  const privateUser = usePrivateUser()

  const { editor, upload } = useTextEditor({
    simple: true,
    placeholder: 'Send a message',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [scrollToBottomRef, setScrollToBottomRef] =
    useState<HTMLDivElement | null>(null)
  const [scrollToMessageId, setScrollToMessageId] = useState('')
  const [scrollToMessageRef, setScrollToMessageRef] =
    useState<HTMLDivElement | null>(null)
  const [replyToUser, setReplyToUser] = useState<any>()

  const router = useRouter()
  const isMember = user && group.memberIds.includes(user?.id)

  const { width, height } = useWindowSize()
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null)
  // Subtract bottom bar when it's showing (less than lg screen)
  const bottomBarHeight = (width ?? 0) < 1024 ? 58 : 0
  const remainingHeight =
    (height ?? 0) - (containerRef?.offsetTop ?? 0) - bottomBarHeight

  // array of groups, where each group is an array of messages that are displayed as one
  const groupedMessages = useMemo(() => {
    // Group messages with createdTime within 2 minutes of each other.
    const tempGrouped: GroupComment[][] = []
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i]
      if (i === 0) tempGrouped.push([message])
      else {
        const prevMessage = messages[i - 1]
        const diff = message.createdTime - prevMessage.createdTime
        const creatorsMatch = message.userId === prevMessage.userId
        if (diff < 2 * 60 * 1000 && creatorsMatch) {
          tempGrouped.at(-1)?.push(message)
        } else {
          tempGrouped.push([message])
        }
      }
    }

    return tempGrouped
  }, [messages])

  useEffect(() => {
    scrollToMessageRef?.scrollIntoView()
  }, [scrollToMessageRef])

  useEffect(() => {
    if (scrollToBottomRef)
      scrollToBottomRef.scrollTo({ top: scrollToBottomRef.scrollHeight || 0 })
    // Must also listen to groupedMessages as they update the height of the messaging window
  }, [scrollToBottomRef, groupedMessages])

  useEffect(() => {
    const elementInUrl = router.asPath.split('#')[1]
    if (messages.map((m) => m.id).includes(elementInUrl)) {
      setScrollToMessageId(elementInUrl)
    }
  }, [messages, router.asPath])

  useEffect(() => {
    // is mobile?
    if (width && width > 720) focusInput()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width])

  function onReplyClick(comment: Comment) {
    setReplyToUser({ id: comment.userId, username: comment.userUsername })
  }

  async function submitMessage() {
    if (!user) {
      track('sign in to comment')
      return await firebaseLogin()
    }
    if (!editor || editor.isEmpty || isSubmitting) return
    setIsSubmitting(true)
    await createCommentOnGroup(group.id, editor.getJSON(), user)
    editor.commands.clearContent()
    setIsSubmitting(false)
    setReplyToUser(undefined)
    focusInput()
  }
  function focusInput() {
    editor?.commands.focus()
  }

  return (
    <Col ref={setContainerRef} style={{ height: remainingHeight }}>
      <Col
        className={
          'w-full flex-1 space-y-2 overflow-x-hidden overflow-y-scroll pt-2'
        }
        ref={setScrollToBottomRef}
      >
        {groupedMessages.map((messages) => (
          <GroupMessage
            user={user}
            key={`group ${messages[0].id}`}
            comments={messages}
            group={group}
            onReplyClick={onReplyClick}
            highlight={messages[0].id === scrollToMessageId}
            setRef={
              scrollToMessageId === messages[0].id
                ? setScrollToMessageRef
                : undefined
            }
            tips={tips[messages[0].id] ?? {}}
          />
        ))}
        {messages.length === 0 && (
          <div className="p-2 text-gray-500">
            No messages yet. Why not{isMember ? ` ` : ' join and '}
            <button
              className={'cursor-pointer font-bold text-gray-700'}
              onClick={focusInput}
            >
              add one?
            </button>
          </div>
        )}
      </Col>
      {user && group.memberIds.includes(user.id) && (
        <div className="flex w-full justify-start gap-2 p-2">
          <div className="mt-1">
            <Avatar
              username={user?.username}
              avatarUrl={user?.avatarUrl}
              size={'sm'}
            />
          </div>
          <div className={'flex-1'}>
            <CommentInputTextArea
              editor={editor}
              upload={upload}
              user={user}
              replyToUser={replyToUser}
              submitComment={submitMessage}
              isSubmitting={isSubmitting}
              submitOnEnter
            />
          </div>
        </div>
      )}

      {privateUser && (
        <GroupChatNotificationsIcon
          group={group}
          privateUser={privateUser}
          shouldSetAsSeen={true}
          hidden={true}
        />
      )}
    </Col>
  )
}

export function GroupChatInBubble(props: {
  messages: GroupComment[]
  user: User | null | undefined
  privateUser: PrivateUser | null | undefined
  group: Group
  tips: CommentTipMap
}) {
  const { messages, user, group, tips, privateUser } = props
  const [shouldShowChat, setShouldShowChat] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const groupsWithChatEmphasis = [
      'welcome',
      'bugs',
      'manifold-features-25bad7c7792e',
      'updates',
    ]
    if (
      router.asPath.includes('/chat') ||
      groupsWithChatEmphasis.includes(
        router.asPath.split('/group/')[1].split('/')[0]
      )
    ) {
      setShouldShowChat(true)
    }
    // Leave chat open between groups if user is using chat?
    else {
      setShouldShowChat(false)
    }
  }, [router.asPath])

  return (
    <Col
      className={clsx(
        'fixed right-0 bottom-[0px] h-1 w-full sm:bottom-[20px] sm:right-20 sm:w-2/3 md:w-1/2 lg:right-24 lg:w-1/3 xl:right-32 xl:w-1/4',
        shouldShowChat ? 'p-2m z-10 h-screen bg-white' : ''
      )}
    >
      {shouldShowChat && (
        <GroupChat messages={messages} user={user} group={group} tips={tips} />
      )}
      <button
        type="button"
        className={clsx(
          'fixed right-1 inline-flex items-center rounded-full border md:right-2 lg:right-5 xl:right-10' +
            ' border-transparent p-3 text-white shadow-sm lg:p-4' +
            ' focus:outline-none focus:ring-2  focus:ring-offset-2 ' +
            ' bottom-[70px] ',
          shouldShowChat
            ? 'bottom-auto top-2 bg-gray-600 hover:bg-gray-400 focus:ring-gray-500 sm:bottom-[70px] sm:top-auto '
            : ' bg-indigo-600  hover:bg-indigo-700 focus:ring-indigo-500'
        )}
        onClick={() => {
          // router.push('/chat')
          setShouldShowChat(!shouldShowChat)
          track('mobile group chat button')
        }}
      >
        {!shouldShowChat ? (
          <UsersIcon className="h-10 w-10" aria-hidden="true" />
        ) : (
          <ChevronDownIcon className={'h-10 w-10'} aria-hidden={'true'} />
        )}
        {privateUser && (
          <GroupChatNotificationsIcon
            group={group}
            privateUser={privateUser}
            shouldSetAsSeen={shouldShowChat}
            hidden={false}
          />
        )}
      </button>
    </Col>
  )
}

function GroupChatNotificationsIcon(props: {
  group: Group
  privateUser: PrivateUser
  shouldSetAsSeen: boolean
  hidden: boolean
}) {
  const { privateUser, group, shouldSetAsSeen, hidden } = props
  const preferredNotificationsForThisGroup = useUnseenPreferredNotifications(
    privateUser,
    {
      customHref: `/group/${group.slug}`,
    }
  )
  useEffect(() => {
    preferredNotificationsForThisGroup.forEach((notification) => {
      if (
        (shouldSetAsSeen && notification.isSeenOnHref?.includes('chat')) ||
        // old style chat notif that simply ended with the group slug
        notification.isSeenOnHref?.endsWith(group.slug)
      ) {
        setNotificationsAsSeen([notification])
      }
    })
  }, [group.slug, preferredNotificationsForThisGroup, shouldSetAsSeen])

  return (
    <div
      className={
        !hidden &&
        preferredNotificationsForThisGroup.length > 0 &&
        !shouldSetAsSeen
          ? 'absolute right-4 top-4 h-3 w-3 rounded-full border-2 border-white bg-red-500'
          : 'hidden'
      }
    ></div>
  )
}

const GroupMessage = memo(function GroupMessage_(props: {
  user: User | null | undefined
  comments: GroupComment[]
  group: Group
  onReplyClick?: (comment: Comment) => void
  setRef?: (ref: HTMLDivElement) => void
  highlight?: boolean
  tips: CommentTips
}) {
  const { comments, onReplyClick, group, setRef, highlight, user, tips } = props
  const first = comments[0]
  const { id, userUsername, userName, userAvatarUrl, createdTime } = first

  const isCreatorsComment = user && first.userId === user.id
  return (
    <Col
      ref={setRef}
      className={clsx(
        isCreatorsComment ? 'mr-2 self-end' : '',
        'w-fit max-w-sm gap-1 space-x-3 rounded-md bg-white p-1 text-sm text-gray-500 transition-colors duration-1000  sm:max-w-md sm:p-3 sm:leading-[1.3rem]',
        highlight ? `-m-1 bg-indigo-500/[0.2] p-2` : ''
      )}
    >
      <Row className={'items-center'}>
        {!isCreatorsComment && (
          <Col>
            <Avatar
              className={'mx-2 ml-2.5'}
              size={'xs'}
              username={userUsername}
              avatarUrl={userAvatarUrl}
            />
          </Col>
        )}
        {!isCreatorsComment ? (
          <UserLink username={userUsername} name={userName} />
        ) : (
          <span className={'ml-2.5'}>{'You'}</span>
        )}
        <CopyLinkDateTimeComponent
          prefix={'group'}
          slug={group.slug}
          createdTime={createdTime}
          elementId={id}
        />
      </Row>
      <div className="mt-2 text-base text-black">
        {comments.map((comment) => (
          <Content
            key={comment.id}
            content={comment.content || comment.text}
            smallImage
          />
        ))}
      </div>
      <Row>
        {!isCreatorsComment && onReplyClick && (
          <button
            className={
              'self-start py-1 text-xs font-bold text-gray-500 hover:underline'
            }
            onClick={() => onReplyClick(first)}
          >
            Reply
          </button>
        )}
        {isCreatorsComment && sum(Object.values(tips)) > 0 && (
          <span className={'text-primary'}>
            {formatMoney(sum(Object.values(tips)))}
          </span>
        )}
        {!isCreatorsComment && <Tipper comment={first} tips={tips} />}
      </Row>
    </Col>
  )
})
