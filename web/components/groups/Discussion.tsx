import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import React, { useEffect, memo, useState } from 'react'
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

export function Discussion(props: {
  messages: Comment[]
  user: User | null | undefined
  group: Group
}) {
  const { messages, user, group } = props
  const [messageText, setMessageText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [scrollToBottomRef, setScrollToBottomRef] =
    useState<HTMLDivElement | null>(null)
  const [scrollToCommentId, setScrollToCommentId] = useState('')
  const [scrollToCommentRef, setScrollToCommentRef] =
    useState<HTMLDivElement | null>(null)
  const [replyToUsername, setReplyToUsername] = useState('')
  const router = useRouter()

  useEffect(() => {
    scrollToCommentRef?.scrollIntoView()
  }, [scrollToCommentRef])

  useEffect(() => {
    scrollToBottomRef?.scrollIntoView()
  }, [isSubmitting, scrollToBottomRef, replyToUsername])

  useEffect(() => {
    const elementInUrl = router.asPath.split('#')[1]
    if (messages.map((m) => m.id).includes(elementInUrl)) {
      setScrollToCommentId(elementInUrl)
    }
  }, [messages, router.asPath])

  function onReplyClick(comment: Comment) {
    setReplyToUsername(comment.userUsername)
  }

  async function submitComment() {
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
  }

  return (
    <Col className={'flex-1'}>
      <Col
        className={
          'max-h-[65vh] w-full space-y-2 overflow-x-hidden overflow-y-scroll'
        }
      >
        {messages.map((message, i) => (
          <GroupComment
            user={user}
            key={message.id}
            comment={message}
            group={group}
            onReplyClick={onReplyClick}
            highlight={message.id === scrollToCommentId}
            setRef={
              scrollToCommentId === message.id
                ? setScrollToCommentRef
                : i === messages.length - 1
                ? setScrollToBottomRef
                : undefined
            }
          />
        ))}
        {messages.length === 0 && (
          <div className="p-2 text-gray-500">
            No messages yet. 🦗... Why not say something?
          </div>
        )}
      </Col>
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
            submitComment={submitComment}
            isSubmitting={isSubmitting}
            enterToSubmit={true}
          />
        </div>
      </div>
    </Col>
  )
}

function GroupComment_(props: {
  user: User | null | undefined
  comment: Comment
  group: Group
  truncate?: boolean
  smallAvatar?: boolean
  onReplyClick?: (comment: Comment) => void
  setRef?: (ref: HTMLDivElement) => void
  highlight?: boolean
}) {
  const { comment, truncate, onReplyClick, group, setRef, highlight, user } =
    props
  const { text, userUsername, userName, userAvatarUrl, createdTime } = comment
  return (
    <Row
      ref={setRef}
      className={clsx(
        comment.userId === user?.id ? 'mr-2 self-end' : ' ml-2',
        'w-fit space-x-1.5 rounded-md bg-white p-2 px-4 transition-all duration-1000 sm:space-x-3',
        highlight ? `-m-1 bg-indigo-500/[0.2] p-2` : ''
      )}
    >
      <Avatar
        className={'ml-1'}
        size={'sm'}
        username={userUsername}
        avatarUrl={userAvatarUrl}
      />
      <div className="w-full">
        <div className="mt-0.5 pl-0.5 text-sm text-gray-500">
          <UserLink
            className="text-gray-500"
            username={userUsername}
            name={userName}
          />{' '}
          <CopyLinkDateTimeComponent
            prefix={'group'}
            slug={group.slug}
            createdTime={createdTime}
            elementId={comment.id}
          />
        </div>
        <TruncatedComment
          comment={text}
          moreHref={groupPath(group.slug)}
          shouldTruncate={truncate}
        />
        {onReplyClick && (
          <button
            className={'text-xs font-bold text-gray-500 hover:underline'}
            onClick={() => onReplyClick(comment)}
          >
            Reply
          </button>
        )}
      </div>
    </Row>
  )
}
const GroupComment = memo(GroupComment_)
