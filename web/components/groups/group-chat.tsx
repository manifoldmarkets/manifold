import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
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

export function GroupChat(props: {
  messages: Comment[]
  user: User | null | undefined
  group: Group
}) {
  const { messages, user, group } = props
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
    if (!isSubmitting)
      scrollToBottomRef?.scrollTo({ top: scrollToBottomRef?.scrollHeight || 0 })
  }, [scrollToBottomRef, isSubmitting])

  useEffect(() => {
    const elementInUrl = router.asPath.split('#')[1]
    if (messages.map((m) => m.id).includes(elementInUrl)) {
      setScrollToMessageId(elementInUrl)
    }
  }, [messages, router.asPath])

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
  function focusInput() {
    inputRef?.focus()
  }

  return (
    <Col className={'flex-1'}>
      <Col
        className={
          'max-h-[65vh] w-full space-y-2 overflow-x-hidden overflow-y-scroll'
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
          />
        ))}
        {messages.length === 0 && (
          <div className="p-2 text-gray-500">
            No messages yet. Why not{' '}
            <button
              className={'cursor-pointer font-bold text-gray-700'}
              onClick={() => focusInput()}
            >
              add one?
            </button>
          </div>
        )}
      </Col>
      {user && group.memberIds.includes(user.id) && (
        <div className=" flex w-full justify-start gap-2 p-2">
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
              enterToSubmit={true}
              setRef={setInputRef}
            />
          </div>
        </div>
      )}
    </Col>
  )
}

const GroupMessage = memo(function GroupMessage_(props: {
  user: User | null | undefined
  comment: Comment
  group: Group
  onReplyClick?: (comment: Comment) => void
  setRef?: (ref: HTMLDivElement) => void
  highlight?: boolean
}) {
  const { comment, onReplyClick, group, setRef, highlight, user } = props
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
    </Col>
  )
})
