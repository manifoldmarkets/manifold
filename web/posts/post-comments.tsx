import { track } from '@amplitude/analytics-browser'
import clsx from 'clsx'
import { PostComment } from 'common/comment'
import { Post } from 'common/post'
import { User } from 'common/user'
import { Dictionary } from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Avatar } from 'web/components/avatar'
import { Content, useTextEditor } from 'web/components/editor'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { CommentInputTextArea } from 'web/components/feed/feed-comments'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tipper } from 'web/components/tipper'
import { UserLink } from 'web/components/user-link'
import { CommentTipMap, CommentTips } from 'web/hooks/use-tip-txns'
import { useUser } from 'web/hooks/use-user'
import {
  createCommentOnPost,
  MAX_COMMENT_LENGTH,
} from 'web/lib/firebase/comments'
import { firebaseLogin } from 'web/lib/firebase/users'

export function PostCommentThread(props: {
  user: User | null | undefined
  post: Post
  threadComments: PostComment[]
  tips: CommentTipMap
  parentComment: PostComment
  commentsByUserId: Dictionary<PostComment[]>
}) {
  const { user, post, threadComments, commentsByUserId, tips, parentComment } =
    props
  const [showReply, setShowReply] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; username: string }>()

  function scrollAndOpenReplyInput(comment: PostComment) {
    setReplyTo({ id: comment.userId, username: comment.userUsername })
    setShowReply(true)
  }

  return (
    <Col className="relative w-full items-stretch gap-3 pb-4">
      sdafasdfadsf
      <span
        className="absolute top-5 left-4 -ml-px h-[calc(100%-2rem)] w-0.5 bg-gray-200"
        aria-hidden="true"
      />
      {[parentComment].concat(threadComments).map((comment, commentIdx) => (
        <PostComment
          key={comment.id}
          indent={commentIdx != 0}
          post={post}
          comment={comment}
          tips={tips[comment.id]}
          onReplyClick={scrollAndOpenReplyInput}
        />
      ))}
      {showReply && (
        <Col className="-pb-2 relative ml-6">
          <span
            className="absolute -left-1 -ml-[1px] mt-[0.8rem] h-2 w-0.5 rotate-90 bg-gray-200"
            aria-hidden="true"
          />
          <CommentInput
            post={post}
            commentsByCurrentUser={(user && commentsByUserId[user.id]) ?? []}
            parentCommentId={parentComment.id}
            replyToUser={replyTo}
            onSubmitComment={() => setShowReply(false)}
          />
        </Col>
      )}
    </Col>
  )
}

export function PostComment(props: {
  post: Post
  comment: PostComment
  tips: CommentTips
  indent?: boolean
  probAtCreatedTime?: number
  onReplyClick?: (comment: PostComment) => void
}) {
  const { post, comment, tips, indent, probAtCreatedTime, onReplyClick } = props
  const { text, content, userUsername, userName, userAvatarUrl, createdTime } =
    comment

  const [highlighted, setHighlighted] = useState(false)
  const router = useRouter()
  useEffect(() => {
    if (router.asPath.endsWith(`#${comment.id}`)) {
      setHighlighted(true)
    }
  }, [comment.id, router.asPath])

  return (
    <Row
      id={comment.id}
      className={clsx(
        'relative',
        indent ? 'ml-6' : '',
        highlighted ? `-m-1.5 rounded bg-indigo-500/[0.2] p-1.5` : ''
      )}
    >
      {/*draw a gray line from the comment to the left:*/}
      {indent ? (
        <span
          className="absolute -left-1 -ml-[1px] mt-[0.8rem] h-2 w-0.5 rotate-90 bg-gray-200"
          aria-hidden="true"
        />
      ) : null}
      <Avatar size="sm" username={userUsername} avatarUrl={userAvatarUrl} />
      <div className="ml-1.5 min-w-0 flex-1 pl-0.5 sm:ml-3">
        <div className="mt-0.5 text-sm text-gray-500">
          <UserLink
            className="text-gray-500"
            username={userUsername}
            name={userName}
          />{' '}
          <CopyLinkDateTimeComponent
            prefix={comment.userName}
            slug={post.slug}
            createdTime={createdTime}
            elementId={comment.id}
          />
        </div>
        <Content
          className="mt-2 text-[15px] text-gray-700"
          content={content || text}
          smallImage
        />
        <Row className="mt-2 items-center gap-6 text-xs text-gray-500">
          <Tipper comment={comment} tips={tips ?? {}} />
          {onReplyClick && (
            <button
              className="font-bold hover:underline"
              onClick={() => onReplyClick(comment)}
            >
              Reply
            </button>
          )}
        </Row>
      </div>
    </Row>
  )
}

export function CommentInput(props: {
  post: Post
  commentsByCurrentUser: PostComment[]
  className?: string
  replyToUser?: { id: string; username: string }
  // Reply to a free response answer
  parentAnswerOutcome?: string
  // Reply to another comment
  parentCommentId?: string
  onSubmitComment?: () => void
}) {
  const {
    post,
    className,
    parentAnswerOutcome,
    parentCommentId,
    replyToUser,
    onSubmitComment,
  } = props
  const user = useUser()
  const { editor, upload } = useTextEditor({
    simple: true,
    max: MAX_COMMENT_LENGTH,
    placeholder:
      !!parentCommentId || !!parentAnswerOutcome
        ? 'Write a reply...'
        : 'Write a comment...',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submitComment(betId: string | undefined) {
    if (!user) {
      track('sign in to comment')
      return await firebaseLogin()
    }
    if (!editor || editor.isEmpty || isSubmitting) return
    setIsSubmitting(true)
    await createCommentOnPost(post.id, editor.getJSON(), user, parentCommentId)
    onSubmitComment?.()
    setIsSubmitting(false)
  }

  if (user?.isBannedFromPosting) return <></>

  return (
    <Row className={clsx(className, 'mb-2 gap-1 sm:gap-2')}>
      <Avatar
        avatarUrl={user?.avatarUrl}
        username={user?.username}
        size="sm"
        className="mt-2"
      />
      <div className="min-w-0 flex-1 pl-0.5 text-sm">
        <div className="mb-1 text-gray-500"></div>
        <CommentInputTextArea
          editor={editor}
          upload={upload}
          replyToUser={replyToUser}
          user={user}
          submitComment={submitComment}
          isSubmitting={isSubmitting}
        />
      </div>
    </Row>
  )
}
