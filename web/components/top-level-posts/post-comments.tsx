import { Editor } from '@tiptap/core'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'
import { PostComment } from 'common/comment'
import { getPostCommentShareUrl, TopLevelPost } from 'common/top-level-post'
import { Dictionary, groupBy, sortBy } from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from 'web/components/widgets/avatar'
import { CommentInput } from 'web/components/comments/comment-input'
import { Content } from 'web/components/widgets/editor'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { UserLink } from 'web/components/widgets/user-link'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'
import { toast } from 'react-hot-toast'
import { APIError } from 'common/api/utils'
import { api } from 'web/lib/api/api'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { getCommentsOnPost } from 'web/lib/supabase/comments'
import { UserHovercard } from 'web/components/user/user-hovercard'
import {
  ReplyIcon,
  DotsHorizontalIcon,
  EyeOffIcon,
  LinkIcon,
  EyeIcon,
} from '@heroicons/react/solid'
import DropdownMenu, {
  DropdownItem,
} from 'web/components/widgets/dropdown-menu'
import { IconButton } from 'web/components/buttons/button'
import { Tooltip } from 'web/components/widgets/tooltip'
import { copyToClipboard } from 'web/lib/util/copy'
import { buildArray } from 'common/util/array'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { ReactButton } from 'web/components/contract/react-button'

const roundThreadColor = 'border-ink-100 dark:border-ink-200'

export function PostCommentsActivity(props: {
  post: TopLevelPost
  comments: PostComment[]
}) {
  const { post, comments } = props
  const commentsByUserId = groupBy(comments, (c) => c.userId)
  const commentsByParentId = groupBy(comments, (c) => c.replyToCommentId ?? '_')
  const topLevelComments = sortBy(
    commentsByParentId['_'] ?? [],
    (c) => -c.createdTime
  )

  return (
    <Col>
      <PostCommentInput post={post} />
      {topLevelComments.map((parent) => (
        <PostCommentThread
          key={parent.id}
          post={post}
          parentComment={parent}
          threadComments={sortBy(
            commentsByParentId[parent.id] ?? [],
            (c) => c.createdTime
          )}
          commentsByUserId={commentsByUserId}
        />
      ))}
    </Col>
  )
}

export function PostCommentThread(props: {
  post: TopLevelPost
  threadComments: PostComment[]
  parentComment: PostComment
  commentsByUserId: Dictionary<PostComment[]>
}) {
  const { post, threadComments, parentComment } = props
  const [showReply, setShowReply] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; username: string }>()

  function scrollAndOpenReplyInput(comment: PostComment) {
    setReplyTo({ id: comment.userId, username: comment.userUsername })
    setShowReply(true)
  }

  return (
    <Col className="relative w-full items-stretch gap-3 pb-4">
      <span
        className="bg-ink-200 absolute left-4 top-5 -ml-px h-[calc(100%-2rem)] w-0.5"
        aria-hidden="true"
      />
      {[parentComment].concat(threadComments).map((comment, commentIdx) => (
        <PostCommentItem
          key={comment.id}
          indent={commentIdx != 0}
          post={post}
          comment={comment}
          onReplyClick={scrollAndOpenReplyInput}
        />
      ))}
      {showReply && (
        <Col className="-pb-2 relative ml-6">
          <span
            className="bg-ink-200 absolute -left-1 -ml-[1px] mt-[0.8rem] h-2 w-0.5 rotate-90"
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
  post: TopLevelPost
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
      await firebaseLogin()
      return
    }

    try {
      await api('create-post-comment', {
        postId: post.id,
        content: editor.getJSON(),
        replyToCommentId: parentCommentId,
      })

      track('post message', {
        user,
        surfaceId: post.id,
        replyToCommentId: parentCommentId,
      })

      props.onSubmitComment?.()
    } catch (e) {
      console.error(e)
      if (e instanceof APIError) {
        toast.error(e.message)
      } else {
        toast.error('Error submitting comment. Try again?')
      }
    }
  }

  return (
    <CommentInput
      autoFocus={false}
      replyToUserInfo={replyToUser}
      parentCommentId={parentCommentId}
      onSubmitComment={onSubmitComment}
      pageId={post.id}
      blocked={isBlocked(privateUser, post.creatorId)}
      commentTypes={['top-level-post']}
    />
  )
}

export function PostCommentItem(props: {
  post: TopLevelPost
  comment: PostComment
  indent?: boolean
  probAtCreatedTime?: number
  onReplyClick?: (comment: PostComment) => void
}) {
  const { post, comment, indent, onReplyClick } = props
  const { userId, userUsername, userName, userAvatarUrl, createdTime } = comment
  const user = useUser()
  const isAdminOrMod = useAdminOrMod()
  const commentRef = useRef<HTMLDivElement>(null)
  const [highlighted, setHighlighted] = useState(false)
  const router = useRouter()
  const [optimisticallyHidden, setOptimisticallyHidden] = useState(
    comment.hidden ?? false
  )
  useEffect(() => {
    if (router.asPath.endsWith(`#${comment.id}`)) {
      setHighlighted(true)
    }
  }, [comment.id, router.asPath])

  useEffect(() => {
    if (highlighted && commentRef.current) {
      scrollIntoViewCentered(commentRef.current)
    }
  }, [highlighted, commentRef.current?.id])

  const isParent = !indent

  const menuItems: DropdownItem[] = buildArray(
    {
      name: 'Copy Link',
      icon: <LinkIcon className="h-5 w-5" />,
      onClick: () => {
        copyToClipboard(
          getPostCommentShareUrl(post, comment.id, user?.username)
        )
        toast.success('Link copied to clipboard')
      },
    },
    isAdminOrMod && {
      name: optimisticallyHidden ? 'Unhide comment' : 'Hide comment',
      icon: optimisticallyHidden ? (
        <EyeIcon className="h-5 w-5" />
      ) : (
        <EyeOffIcon className="h-5 w-5" />
      ),
      onClick: async () => {
        const currentlyHidden = optimisticallyHidden
        setOptimisticallyHidden(!currentlyHidden)
        try {
          await api('update-post-comment', {
            commentId: comment.id,
            postId: post.id,
            hidden: !currentlyHidden,
          })
          toast.success(
            !currentlyHidden ? 'Comment hidden' : 'Comment unhidden'
          )
        } catch (e) {
          setOptimisticallyHidden(currentlyHidden)
          toast.error('Error hiding/unhiding comment')
          console.error(e)
        }
      },
    }
  )

  return (
    <Col id={comment.id} ref={commentRef} className="group">
      <Row className={clsx(isParent ? 'gap-2' : 'gap-1')}>
        <Row className="relative">
          {!isParent && (
            <div
              className={clsx(
                roundThreadColor,
                '-mt-4 ml-4 h-6 w-4 rounded-bl-xl border-b-2 border-l'
              )}
            />
          )}
          <UserHovercard userId={userId} className="z-10 self-start">
            <Avatar
              username={userUsername}
              size={isParent ? 'sm' : '2xs'}
              avatarUrl={userAvatarUrl}
            />
          </UserHovercard>
        </Row>
        <Col
          className={clsx(
            'grow rounded-lg rounded-tl-none px-3 pb-0.5 pt-1 transition-colors',
            highlighted
              ? 'bg-primary-100 border-primary-300 border-2'
              : 'bg-canvas-50'
          )}
        >
          <div className="text-ink-500 mt-0.5 flex items-center justify-between text-xs sm:text-sm">
            <Row className="gap-1">
              <UserLink
                user={{
                  id: userId,
                  name: userName,
                  username: userUsername,
                }}
              />
            </Row>
            <CopyLinkDateTimeComponent
              prefix={'post'}
              slug={post.slug}
              createdTime={createdTime}
              elementId={comment.id}
            />
            <DropdownMenu
              items={menuItems}
              buttonContent={<DotsHorizontalIcon className="h-5 w-5" />}
              menuWidth="w-40"
              buttonClass="px-1 py-0"
              className="ml-auto self-start"
            />
          </div>
          <HideableContent
            comment={comment}
            optimisticallyHidden={optimisticallyHidden}
          />
          <Row className="text-ink-500 mt-2 w-full items-center justify-end gap-1 text-xs">
            <ReactButton
              contentId={comment.id}
              contentCreatorId={comment.userId}
              user={user}
              contentType={'comment'}
              reactionType={'like'}
              contentText={`comment by ${comment.userName}`}
              trackingLocation={'post comment item'}
              size={'xs'}
              className={'text-gray-500'}
              postId={post.id}
            />
            {onReplyClick && (
              <Tooltip text="Reply" placement="bottom">
                <IconButton
                  size="xs"
                  onClick={() => onReplyClick(comment)}
                  className="hover:text-primary-700"
                >
                  <ReplyIcon className="h-5 w-5" />
                </IconButton>
              </Tooltip>
            )}
          </Row>
        </Col>
      </Row>
    </Col>
  )
}

function HideableContent(props: {
  comment: PostComment
  optimisticallyHidden?: boolean
}) {
  const { comment, optimisticallyHidden } = props
  const { text, content } = comment
  //hides if enough dislikes
  const dislikes = comment.dislikes ?? 0
  const likes = comment.likes ?? 0
  const majorityDislikes = dislikes > 10 && dislikes / (likes + dislikes) >= 0.8

  const hidden = optimisticallyHidden ?? comment.hidden
  const initiallyHidden = majorityDislikes || hidden
  const [showHidden, setShowHidden] = useState(false)

  return initiallyHidden && !showHidden ? (
    <div
      className="hover text-ink-600 text-sm font-thin italic hover:cursor-pointer"
      onClick={() => {
        setShowHidden(!showHidden)
      }}
    >
      Comment hidden
    </div>
  ) : (
    <Content size="sm" className="mt-1 grow" content={content || text} />
  )
}

export const useNewPostComments = (postId: string) => {
  const [comments, setComments] = useState<PostComment[]>([])

  useApiSubscription({
    topics: [`post/${postId}/new-comment`],
    onBroadcast: (data) =>
      setComments((c) => [...c, data.data.comment as PostComment]),
  })

  return { comments }
}

export const usePostComments = (postId: string, afterTime?: string) => {
  const [comments, setComments] = useState<PostComment[]>([])

  useEffect(() => {
    getCommentsOnPost(postId, afterTime).then((comments) => {
      setComments(comments)
    })
  }, [postId, afterTime])

  return { comments }
}
