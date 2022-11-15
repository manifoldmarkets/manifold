import { Editor } from '@tiptap/core'
import { sum } from 'lodash'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'
import { PostComment } from 'common/comment'
import { Post } from 'common/post'
import { Dictionary } from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Avatar } from 'web/components/widgets/avatar'
import { CommentInput } from 'web/components/comments/comment-input'
import { Content } from 'web/components/widgets/editor'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tipper } from 'web/components/widgets/tipper'
import { UserLink } from 'web/components/widgets/user-link'
import { CommentTipMap, CommentTips } from 'web/hooks/use-tip-txns'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { createCommentOnPost } from 'web/lib/firebase/comments'
import { firebaseLogin } from 'web/lib/firebase/users'

export function PostCommentThread(props: {
  post: Post
  threadComments: PostComment[]
  tips: CommentTipMap
  parentComment: PostComment
  commentsByUserId: Dictionary<PostComment[]>
}) {
  const { post, threadComments, tips, parentComment } = props
  const [showReply, setShowReply] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; username: string }>()

  function scrollAndOpenReplyInput(comment: PostComment) {
    setReplyTo({ id: comment.userId, username: comment.userUsername })
    setShowReply(true)
  }

  return (
    <Col className="relative w-full items-stretch gap-3 pb-4">
      <span
        className="absolute top-5 left-4 -ml-px h-[calc(100%-2rem)] w-0.5 bg-gray-200"
        aria-hidden="true"
      />
      {[parentComment].concat(threadComments).map((comment, commentIdx) => (
        <PostCommentItem
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
          <PostCommentInput
            post={post}
            parentCommentId={parentComment.id}
            replyToUser={replyTo}
            onSubmitComment={() => setShowReply(false)}
          />
        </Col>
      )}
    </Col>
  )
}

export function PostCommentInput(props: {
  post: Post
  parentCommentId?: string
  replyToUser?: { id: string; username: string }
  onSubmitComment?: () => void
}) {
  const user = useUser()
  const privateUser = usePrivateUser()

  const { post, parentCommentId, replyToUser } = props

  async function onSubmitComment(editor: Editor) {
    if (!user) {
      track('sign in to comment')
      return await firebaseLogin()
    }
    await createCommentOnPost(post.id, editor.getJSON(), user, parentCommentId)
    props.onSubmitComment?.()
  }

  return (
    <CommentInput
      replyTo={replyToUser}
      parentCommentId={parentCommentId}
      onSubmitComment={onSubmitComment}
      pageId={post.id}
      blocked={privateUser?.blockedByUserIds.includes(post.creatorId)}
    />
  )
}

export function PostCommentItem(props: {
  post: Post
  comment: PostComment
  tips: CommentTips
  indent?: boolean
  probAtCreatedTime?: number
  onReplyClick?: (comment: PostComment) => void
}) {
  const { post, comment, tips, indent, onReplyClick } = props
  const { text, content, userUsername, userName, userAvatarUrl, createdTime } =
    comment

  const me = useUser()
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
        highlighted ? `bg-indigo-50` : ''
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
            prefix={'post'}
            slug={post.slug}
            createdTime={createdTime}
            elementId={comment.id}
          />
        </div>
        <Content className="mt-2" size="sm" content={content || text} />
        <Row className="mt-2 items-center gap-6 text-xs text-gray-500">
          {onReplyClick && (
            <button
              className="font-bold hover:underline"
              onClick={() => onReplyClick(comment)}
            >
              Reply
            </button>
          )}
          <Tipper
            comment={comment}
            myTip={me ? tips?.[me.id] ?? 0 : 0}
            totalTip={sum(Object.values(tips ?? {}))}
          />
        </Row>
      </div>
    </Row>
  )
}
