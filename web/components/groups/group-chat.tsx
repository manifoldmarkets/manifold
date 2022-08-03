import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { PrivateUser, User } from 'common/user'
import React, { useEffect, memo, useState, useMemo } from 'react'
import { Avatar } from 'web/components/avatar'
import { Group } from 'common/group'
import { Comment, createCommentOnGroup } from 'web/lib/firebase/comments'
import {
  CommentInputTextArea,
  TruncatedComment,
} from 'web/components/feed/feed-comments'
import { track } from 'web/lib/service/analytics'
import { firebaseLogin } from 'web/lib/firebase/users'

import { useRouter } from 'next/router'
import clsx from 'clsx'
import { UserLink } from 'web/components/user-page'

import { groupPath } from 'web/lib/firebase/groups'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { CommentTipMap, CommentTips } from 'web/hooks/use-tip-txns'
import { Tipper } from 'web/components/tipper'
import { sum } from 'lodash'
import { formatMoney } from 'common/util/format'
import { useWindowSize } from 'web/hooks/use-window-size'
import { useUnseenPreferredNotifications } from 'web/hooks/use-notifications'
import { ChatIcon, ChevronDownIcon } from '@heroicons/react/outline'
import { setNotificationsAsSeen } from 'web/pages/notifications'

export function GroupChat(props: {
  messages: Comment[]
  user: User | null | undefined
  group: Group
  tips: CommentTipMap
}) {
  const { messages, user, group, tips } = props
  const [messageText, setMessageText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [scrollToBottomRef, setScrollToBottomRef] =
    useState<HTMLDivElement | null>(null)
  const [scrollToMessageId, setScrollToMessageId] = useState('')
  const [scrollToMessageRef, setScrollToMessageRef] =
    useState<HTMLDivElement | null>(null)
  const [replyToUsername, setReplyToUsername] = useState('')
  const [inputRef, setInputRef] = useState<HTMLTextAreaElement | null>(null)
  const [groupedMessages, setGroupedMessages] = useState<Comment[]>([])
  const router = useRouter()
  const isMember = user && group.memberIds.includes(user?.id)

  const { width, height } = useWindowSize()
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null)
  // Subtract bottom bar when it's showing (less than lg screen)
  const bottomBarHeight = (width ?? 0) < 1024 ? 58 : 0
  const remainingHeight =
    (height ?? 0) - (containerRef?.offsetTop ?? 0) - bottomBarHeight

  useMemo(() => {
    // Group messages with createdTime within 2 minutes of each other.
    const tempMessages = []
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i]
      if (i === 0) tempMessages.push({ ...message })
      else {
        const prevMessage = messages[i - 1]
        const diff = message.createdTime - prevMessage.createdTime
        const creatorsMatch = message.userId === prevMessage.userId
        if (diff < 2 * 60 * 1000 && creatorsMatch) {
          tempMessages[tempMessages.length - 1].text += `\n${message.text}`
        } else {
          tempMessages.push({ ...message })
        }
      }
    }

    setGroupedMessages(tempMessages)
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
    if (inputRef && width && width > 720) inputRef.focus()
  }, [inputRef, width])

  function onReplyClick(comment: Comment) {
    setReplyToUsername(comment.userUsername)
  }

  async function submitMessage() {
    if (!user) {
      track('sign in to comment')
      return await firebaseLogin()
    }
    if (!messageText || isSubmitting) return
    setIsSubmitting(true)
    await createCommentOnGroup(group.id, messageText, user)
    setMessageText('')
    setIsSubmitting(false)
    setReplyToUsername('')
    inputRef?.focus()
  }

  return (
    <Col ref={setContainerRef} style={{ height: remainingHeight }}>
      <Col
        className={
          'w-full flex-1 space-y-2 overflow-x-hidden overflow-y-scroll pt-2'
        }
        ref={setScrollToBottomRef}
      >
        {groupedMessages.map((message) => (
          <GroupMessage
            user={user}
            key={message.id}
            comment={message}
            group={group}
            onReplyClick={onReplyClick}
            highlight={message.id === scrollToMessageId}
            setRef={
              scrollToMessageId === message.id
                ? setScrollToMessageRef
                : undefined
            }
            tips={tips[message.id] ?? {}}
          />
        ))}
        {messages.length === 0 && (
          <div className="p-2 text-gray-500">
            No messages yet. Why not{isMember ? ` ` : ' join and '}
            <button
              className={'cursor-pointer font-bold text-gray-700'}
              onClick={() => inputRef?.focus()}
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
              commentText={messageText}
              setComment={setMessageText}
              isReply={false}
              user={user}
              replyToUsername={replyToUsername}
              submitComment={submitMessage}
              isSubmitting={isSubmitting}
              enterToSubmitOnDesktop={true}
              setRef={setInputRef}
            />
          </div>
        </div>
      )}
    </Col>
  )
}

export function GroupChatInBubble(props: {
  messages: Comment[]
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
        'fixed right-0 bottom-[0px] h-screen w-full sm:bottom-[20px] sm:right-20 sm:w-2/3 md:w-1/2 lg:right-24 lg:w-1/3 xl:right-32 xl:w-1/4',
        shouldShowChat ? 'z-10 bg-white p-2' : ''
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
          <ChatIcon className="h-10 w-10" aria-hidden="true" />
        ) : (
          <ChevronDownIcon className={'h-10 w-10'} aria-hidden={'true'} />
        )}
        {privateUser && (
          <GroupChatNotificationsIcon
            group={group}
            privateUser={privateUser}
            shouldSetAsSeen={shouldShowChat}
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
}) {
  const { privateUser, group, shouldSetAsSeen } = props
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
        preferredNotificationsForThisGroup.length > 0 && !shouldSetAsSeen
          ? 'absolute right-4 top-4 h-3 w-3 rounded-full border-2 border-white bg-red-500'
          : 'hidden'
      }
    ></div>
  )
}

const GroupMessage = memo(function GroupMessage_(props: {
  user: User | null | undefined
  comment: Comment
  group: Group
  onReplyClick?: (comment: Comment) => void
  setRef?: (ref: HTMLDivElement) => void
  highlight?: boolean
  tips: CommentTips
}) {
  const { comment, onReplyClick, group, setRef, highlight, user, tips } = props
  const { text, userUsername, userName, userAvatarUrl, createdTime } = comment
  const isCreatorsComment = user && comment.userId === user.id
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
          elementId={comment.id}
        />
      </Row>
      <Row className={'text-black'}>
        <TruncatedComment
          comment={text}
          moreHref={groupPath(group.slug)}
          shouldTruncate={false}
        />
      </Row>
      <Row>
        {!isCreatorsComment && onReplyClick && (
          <button
            className={
              'self-start py-1 text-xs font-bold text-gray-500 hover:underline'
            }
            onClick={() => onReplyClick(comment)}
          >
            Reply
          </button>
        )}
        {isCreatorsComment && sum(Object.values(tips)) > 0 && (
          <span className={'text-primary'}>
            {formatMoney(sum(Object.values(tips)))}
          </span>
        )}
        {!isCreatorsComment && <Tipper comment={comment} tips={tips} />}
      </Row>
    </Col>
  )
})
