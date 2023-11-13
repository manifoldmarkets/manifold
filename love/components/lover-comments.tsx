import clsx from 'clsx'
import { memo, ReactNode, useEffect, useRef, useState } from 'react'

import { FlagIcon } from '@heroicons/react/outline'
import { DotsHorizontalIcon, ReplyIcon } from '@heroicons/react/solid'
import { buildArray } from 'common/util/array'
import { toast } from 'react-hot-toast'
import { ReportModal } from 'web/components/buttons/report-button'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { useEvent } from 'web/hooks/use-event'
import { useUser } from 'web/hooks/use-user'
import { firebaseLogin, User } from 'web/lib/firebase/users'
import TriangleDownFillIcon from 'web/lib/icons/triangle-down-fill-icon.svg'
import TriangleFillIcon from 'web/lib/icons/triangle-fill-icon.svg'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'
import { Button, IconButton } from 'web/components/buttons/button'
import { PaymentsModal } from 'web/pages/payments'
import TipJar from 'web/public/custom-components/tipJar'
import { ReplyToggle } from 'web/components/comments/reply-toggle'
import { Content } from 'web/components/widgets/editor'
import { Tooltip } from 'web/components/widgets/tooltip'
import { LoverComment } from 'common/love/love-comment'
import { CommentInput } from 'web/components/comments/comment-input'
import { Editor } from '@tiptap/react'
import { track } from 'web/lib/service/analytics'
import {
  createCommentOnLover,
  hideCommentOnLover,
} from 'web/lib/firebase/love/api'
import { ReplyToUserInfo } from 'web/components/feed/feed-comments'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { useAdmin } from 'web/hooks/use-admin'
import { EyeOffIcon } from '@heroicons/react/outline'

export function LoverProfileCommentThread(props: {
  onUser: User
  threadComments: LoverComment[]
  parentComment: LoverComment
  trackingLocation: string
  collapseMiddle?: boolean
  inTimeline?: boolean
  idInUrl?: string
  showReplies?: boolean
  className?: string
}) {
  const {
    onUser,
    threadComments,
    parentComment,
    collapseMiddle,
    trackingLocation,
    idInUrl,
    showReplies,
    className,
  } = props
  const [replyToUserInfo, setReplyToUserInfo] = useState<ReplyToUserInfo>()

  const idInThisThread =
    idInUrl && threadComments.map((comment) => comment.id).includes(idInUrl)

  const [seeReplies, setSeeReplies] = useState(
    !parentComment.hidden && (showReplies || !!idInThisThread)
  )

  const onSeeRepliesClick = useEvent(() => setSeeReplies(!seeReplies))
  const clearReply = useEvent(() => setReplyToUserInfo(undefined))
  const onReplyClick = useEvent((comment: LoverComment) => {
    setSeeReplies(true)
    setReplyToUserInfo({ id: comment.id, username: comment.userUsername })
  })
  const [collapseToIndex, setCollapseToIndex] = useState<number>(
    collapseMiddle && threadComments.length > 2
      ? threadComments.length - 2
      : Infinity
  )
  return (
    <Col className={clsx('mt-3 items-stretch gap-3', className)}>
      <ParentProfileComment
        onUser={onUser}
        key={parentComment.id}
        comment={parentComment}
        highlighted={idInUrl === parentComment.id}
        seeReplies={seeReplies}
        numReplies={threadComments.length}
        onSeeReplyClick={onSeeRepliesClick}
        onReplyClick={onReplyClick}
        trackingLocation={trackingLocation}
      />
      {seeReplies &&
        threadComments
          .slice(0, collapseToIndex)
          .map((comment) => (
            <ProfileComment
              onUser={onUser}
              key={comment.id}
              comment={comment}
              highlighted={idInUrl === comment.id}
              onReplyClick={onReplyClick}
              trackingLocation={trackingLocation}
            />
          ))}
      {seeReplies && threadComments.length > collapseToIndex && (
        <Row
          className={'justify-end sm:-mb-2 sm:mt-1'}
          key={parentComment.id + 'see-replies-feed-button'}
        >
          <Button
            size={'xs'}
            color={'gray-white'}
            onClick={() => {
              setCollapseToIndex(Infinity)
            }}
          >
            <Col>
              <TriangleFillIcon className={'mr-2 h-2'} />
              <TriangleDownFillIcon className={'mr-2 h-2'} />
            </Col>
            See {threadComments.length - 1} replies
          </Button>
        </Row>
      )}
      {replyToUserInfo && (
        <div className="stop-prop flex">
          <div className="border-ink-100 -mt-3 ml-4 h-7 w-4 rounded-bl-xl border-b-2 border-l-2" />
          <LoverCommentInput
            onUserId={onUser.id}
            parentCommentId={parentComment.id}
            replyToUserInfo={replyToUserInfo}
            clearReply={clearReply}
            trackingLocation={trackingLocation}
            className="w-full min-w-0 grow"
          />
        </div>
      )}
    </Col>
  )
}

const ProfileComment = memo(function FeedComment(props: {
  onUser: User
  comment: LoverComment
  trackingLocation: string
  highlighted?: boolean
  onReplyClick?: (comment: LoverComment) => void
  children?: ReactNode
  isParent?: boolean
}) {
  const {
    onUser,
    highlighted,
    onReplyClick,
    children,
    trackingLocation,
    isParent,
  } = props
  const ref = useRef<HTMLDivElement>(null)
  const [comment, setComment] = useState(props.comment)
  const { userUsername, userAvatarUrl, userId, hidden } = comment
  const owner = onUser.id === userId

  useEffect(() => {
    if (highlighted && ref.current) {
      scrollIntoViewCentered(ref.current)
    }
  }, [highlighted])

  return (
    <Col className="group">
      <Row ref={ref} className={clsx(isParent ? 'gap-2' : 'gap-1')}>
        <Row className="relative">
          {!isParent && (
            <div className="border-ink-100 dark:border-ink-300 -mt-4 ml-4 h-6 w-4 rounded-bl-xl border-b-2 border-l-2" />
          )}
          <Avatar
            username={userUsername}
            size={isParent ? 'sm' : '2xs'}
            avatarUrl={userAvatarUrl}
            className={clsx(owner && 'shadow shadow-amber-300', 'z-10')}
          />
          <div
            className={clsx(
              'bg-ink-100 dark:bg-ink-300 absolute bottom-0 left-4 w-0.5 group-last:hidden ',
              isParent ? 'top-0' : '-top-1'
            )}
          />
        </Row>

        <Col
          className={clsx(
            'grow rounded-lg rounded-tl-none px-3 pb-0.5 pt-1 transition-colors',
            highlighted
              ? 'bg-primary-100 border-primary-300 border-2'
              : 'bg-canvas-0 drop-shadow-sm'
          )}
        >
          <FeedCommentHeader
            comment={comment}
            onUser={onUser}
            isParent={isParent}
            onHide={() => setComment({ ...comment, hidden: !comment.hidden })}
          />

          {hidden ? (
            <span className={'text-ink-500 text-sm italic'}>
              Comment hidden
            </span>
          ) : (
            <Content
              size="sm"
              className="mt-1 grow"
              content={comment.content}
            />
          )}

          <Row>
            {children}
            <CommentActions
              onReplyClick={onReplyClick}
              comment={comment}
              trackingLocation={trackingLocation}
            />
          </Row>
        </Col>
      </Row>
    </Col>
  )
})

const ParentProfileComment = memo(function ParentFeedComment(props: {
  onUser: User
  comment: LoverComment
  highlighted?: boolean
  seeReplies: boolean
  numReplies: number
  onReplyClick?: (comment: LoverComment) => void
  onSeeReplyClick: () => void
  trackingLocation: string
  childrenBountyTotal?: number
}) {
  const {
    onUser,
    comment,
    highlighted,
    onReplyClick,
    onSeeReplyClick,
    seeReplies,
    numReplies,
    trackingLocation,
    childrenBountyTotal,
  } = props

  return (
    <ProfileComment
      onUser={onUser}
      comment={comment}
      onReplyClick={onReplyClick}
      highlighted={highlighted}
      trackingLocation={trackingLocation}
      isParent={true}
    >
      <ReplyToggle
        seeReplies={seeReplies}
        numComments={numReplies}
        childrenBountyTotal={childrenBountyTotal}
        onSeeReplyClick={onSeeReplyClick}
      />
    </ProfileComment>
  )
})

function DotMenu(props: {
  onUser: User
  comment: LoverComment
  onHide: () => void
}) {
  const { comment, onHide, onUser } = props
  const [isModalOpen, setIsModalOpen] = useState(false)
  const user = useUser()
  const isCurrentUser = user?.id === comment.userId
  const isOwner = onUser.id === user?.id
  const isAdmin = useAdmin()
  const [tipping, setTipping] = useState(false)

  return (
    <>
      <ReportModal
        report={{
          contentOwnerId: comment.userId,
          contentId: comment.id,
          contentType: 'comment',
          parentId: onUser.id,
          parentType: 'user',
        }}
        setIsModalOpen={setIsModalOpen}
        isModalOpen={isModalOpen}
        label={'Comment'}
      />
      <DropdownMenu
        menuWidth={'w-36'}
        closeOnClick={true}
        icon={
          <DotsHorizontalIcon
            className="mt-[0.12rem] h-4 w-4"
            aria-hidden="true"
          />
        }
        items={buildArray(
          user &&
            comment.userId !== user.id && {
              name: 'Tip',
              icon: <TipJar size={20} color="currentcolor" />,
              onClick: () => setTipping(true),
            },
          user &&
            comment.userId !== user.id && {
              name: 'Report',
              icon: <FlagIcon className="h-5 w-5" />,
              onClick: () => {
                if (user?.id !== comment.userId) setIsModalOpen(true)
                else toast.error(`You can't report your own comment`)
              },
            },
          (isAdmin || isCurrentUser || isOwner) && {
            name: comment.hidden ? 'Unhide' : 'Hide',
            icon: <EyeOffIcon className="h-5 w-5 text-red-500" />,
            onClick: async () => {
              onHide()
              await toast.promise(
                hideCommentOnLover({
                  commentId: comment.id,
                  hide: !comment.hidden,
                }),
                {
                  loading: comment.hidden
                    ? 'Unhiding comment...'
                    : 'Hiding comment...',
                  success: () => {
                    return comment.hidden
                      ? 'Comment unhidden'
                      : 'Comment hidden'
                  },
                  error: () => {
                    return comment.hidden
                      ? 'Error unhiding comment'
                      : 'Error hiding comment'
                  },
                }
              )
            },
          }
        )}
      />

      {user && tipping && (
        <PaymentsModal
          fromUser={user}
          toUser={
            {
              id: comment.userId,
              name: comment.userName,
              username: comment.userUsername,
              avatarUrl: comment.userAvatarUrl ?? '',
            } as User
          }
          setShow={setTipping}
          show={tipping}
          groupId={comment.id}
          defaultMessage={`Tip for comment on ${onUser.name} profile`}
        />
      )}
    </>
  )
}

function CommentActions(props: {
  onReplyClick?: (comment: LoverComment) => void
  comment: LoverComment
  trackingLocation: string
}) {
  const { onReplyClick, comment } = props
  const user = useUser()

  return (
    <Row className="grow items-center justify-end">
      {user && onReplyClick && (
        <Tooltip text="Reply" placement="bottom">
          <IconButton
            size={'xs'}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onReplyClick(comment)
            }}
            className={'text-ink-500'}
          >
            <ReplyIcon className="h-5 w-5 " />
          </IconButton>
        </Tooltip>
      )}
    </Row>
  )
}

export function LoverCommentInput(props: {
  onUserId: string
  className?: string
  replyToUserInfo?: ReplyToUserInfo
  parentCommentId?: string
  clearReply?: () => void
  trackingLocation: string
}) {
  const {
    parentCommentId,
    onUserId,
    replyToUserInfo,
    className,
    clearReply,
    trackingLocation,
  } = props
  const user = useUser()
  const onSubmitComment = useEvent(async (editor: Editor) => {
    if (!user) {
      track('sign in to comment')
      await firebaseLogin()
      return
    }
    await createCommentOnLover({
      userId: onUserId,
      content: editor.getJSON(),
      replyToCommentId: parentCommentId,
    })
    clearReply?.()
    track('comment', {
      location: trackingLocation,
    })
  })
  return (
    <CommentInput
      pageId={trackingLocation}
      onSubmitComment={onSubmitComment}
      replyToUserInfo={replyToUserInfo}
      parentCommentId={parentCommentId}
      placeholder="Write your endorsement..."
      className={className}
    />
  )
}

function FeedCommentHeader(props: {
  onUser: User
  comment: LoverComment
  onHide: () => void
  isParent?: boolean
}) {
  const { comment, onUser, onHide } = props
  const { userUsername, userName, userId } = comment

  return (
    <Col className={clsx('text-ink-600 text-sm ')}>
      <Row className="justify-between">
        <Row className=" gap-1">
          <span>
            <UserLink
              user={{ id: userId, username: userUsername, name: userName }}
              className={'font-semibold'}
            />
          </span>
          <RelativeTimestamp shortened={true} time={comment.createdTime} />
          <DotMenu onHide={onHide} comment={comment} onUser={onUser} />
        </Row>
      </Row>
    </Col>
  )
}
