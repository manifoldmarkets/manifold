import React, { memo, ReactNode, useEffect, useRef, useState } from 'react'
import { Editor } from '@tiptap/react'
import clsx from 'clsx'

import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { OutcomeLabel } from 'web/components/outcome-label'
import {
  CopyLinkDateTimeComponent,
  copyLinkToComment,
} from 'web/components/feed/copy-link-date-time'
import { firebaseLogin } from 'web/lib/firebase/users'
import { createCommentOnContract } from 'web/lib/firebase/comments'
import { Col } from 'web/components/layout/col'
import { track } from 'web/lib/service/analytics'
import { useEvent } from 'web/hooks/use-event'
import { Content } from '../widgets/editor'
import { UserLink } from 'web/components/widgets/user-link'
import { CommentInput } from '../comments/comment-input'
import { ReplyIcon } from '@heroicons/react/solid'
import { IconButton } from '../buttons/button'
import { ReplyToggle } from '../comments/reply-toggle'
import { ReportModal } from 'web/components/buttons/report-button'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { toast } from 'react-hot-toast'
import LinkIcon from 'web/lib/icons/link-icon'
import { EyeOffIcon, FlagIcon } from '@heroicons/react/outline'
import { LikeButton } from 'web/components/contract/like-button'
import { richTextToString } from 'common/util/parse'
import { buildArray } from 'common/util/array'
import { hideComment } from 'web/lib/firebase/api'
import { useAdmin } from 'web/hooks/use-admin'
import { scrollIntoViewCentered } from 'web/lib/util/scroll'
import { useHashInUrl } from 'web/hooks/use-hash-in-url'
// Link to comments with a prefix, so that browser won't automatically scroll to the comment.
// Leaves us free to scroll the element how we like (e.g. centered and after loading).
export const COMMENT_ID_PREFIX = 'comment-'

export type ReplyTo = { id: string; username: string }

export function FeedCommentThread(props: {
  contract: Contract
  threadComments: ContractComment[]
  parentComment: ContractComment
}) {
  const { contract, threadComments, parentComment } = props
  const [replyTo, setReplyTo] = useState<ReplyTo>()
  const [seeReplies, setSeeReplies] = useState(true)

  const idInUrl = useHashInUrl(COMMENT_ID_PREFIX)

  const onSeeRepliesClick = useEvent(() => setSeeReplies(!seeReplies))
  const onSubmitComment = useEvent(() => setReplyTo(undefined))
  const onReplyClick = useEvent((comment: ContractComment) => {
    setReplyTo({ id: comment.id, username: comment.userUsername })
  })

  return (
    <Col className="w-full items-stretch gap-3 pb-2">
      <ParentFeedComment
        key={parentComment.id}
        contract={contract}
        comment={parentComment}
        highlighted={idInUrl === parentComment.id}
        showLike={true}
        seeReplies={seeReplies}
        numComments={threadComments.length}
        onSeeReplyClick={onSeeRepliesClick}
        onReplyClick={onReplyClick}
      />
      {seeReplies &&
        threadComments.map((comment, _commentIdx) => (
          <FeedComment
            key={comment.id}
            contract={contract}
            comment={comment}
            highlighted={idInUrl === comment.id}
            showLike={true}
            onReplyClick={onReplyClick}
          />
        ))}
      {replyTo && (
        <Col className="-pb-2 relative ml-6">
          <ContractCommentInput
            contract={contract}
            parentCommentId={parentComment.id}
            replyTo={replyTo}
            onSubmitComment={onSubmitComment}
          />
        </Col>
      )}
    </Col>
  )
}
export const FeedComment = memo(function FeedComment(props: {
  contract: Contract
  comment: ContractComment
  highlighted?: boolean
  showLike?: boolean
  onReplyClick?: (comment: ContractComment) => void
  children?: ReactNode
  className?: string
}) {
  const {
    contract,
    className,
    comment,
    highlighted,
    showLike,
    onReplyClick,
    children,
  } = props
  const { userUsername, userAvatarUrl } = comment
  const commentRef = useRef<HTMLDivElement>(null)
  const marketCreator = contract.creatorId === comment.userId

  useEffect(() => {
    if (highlighted && commentRef.current) {
      scrollIntoViewCentered(commentRef.current)
    }
  }, [highlighted])

  return (
    <Row
      ref={commentRef}
      id={comment.id}
      className={clsx(
        className ? className : 'ml-9 gap-2',
        highlighted ? 'bg-primary-50' : ''
      )}
    >
      <Avatar
        size={children ? 'sm' : 'xs'}
        username={userUsername}
        avatarUrl={userAvatarUrl}
        className={marketCreator ? 'shadow shadow-amber-300' : ''}
      />
      <Col className="w-full">
        <FeedCommentHeader comment={comment} contract={contract} />
        <HideableContent comment={comment} />
        <Row className={children ? 'justify-between' : 'justify-end'}>
          {children}
          <CommentActions
            onReplyClick={onReplyClick}
            comment={comment}
            showLike={showLike}
            contract={contract}
          />
        </Row>
      </Col>
    </Row>
  )
})

export const ParentFeedComment = memo(function ParentFeedComment(props: {
  contract: Contract
  comment: ContractComment
  highlighted?: boolean
  showLike?: boolean
  seeReplies: boolean
  numComments: number
  onReplyClick?: (comment: ContractComment) => void
  onSeeReplyClick: () => void
}) {
  const {
    contract,
    comment,
    highlighted,
    showLike,
    onReplyClick,
    onSeeReplyClick,
    seeReplies,
    numComments,
  } = props
  const { userUsername } = comment
  const commentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlighted && commentRef.current) {
      scrollIntoViewCentered(commentRef.current)
    }
  }, [highlighted])

  const commentKind = userUsername === 'ManifoldDream' ? 'ub-dream-comment' : ''
  return (
    <FeedComment
      contract={contract}
      comment={comment}
      onReplyClick={onReplyClick}
      highlighted={highlighted}
      showLike={showLike}
      className={clsx('gap-2', commentKind)}
    >
      <ReplyToggle
        seeReplies={seeReplies}
        numComments={numComments}
        onClick={onSeeReplyClick}
      />
    </FeedComment>
  )
})

function HideableContent(props: { comment: ContractComment }) {
  const { comment } = props
  const { text, content } = comment
  const [showHidden, setShowHidden] = useState(false)
  return comment.hidden && !showHidden ? (
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

export function CommentActions(props: {
  onReplyClick?: (comment: ContractComment) => void
  comment: ContractComment
  showLike?: boolean
  contract: Contract
}) {
  const { onReplyClick, comment, showLike, contract } = props
  const [isModalOpen, setIsModalOpen] = useState(false)
  const user = useUser()
  const privateUser = usePrivateUser()
  const isAdmin = useAdmin()
  const isContractCreator = user?.id === contract.creatorId

  return (
    <Row className="grow items-center justify-end">
      {user && onReplyClick && (
        <IconButton size={'xs'} onClick={() => onReplyClick(comment)}>
          <ReplyIcon className="h-5 w-5" />
        </IconButton>
      )}
      {showLike && (
        <LikeButton
          contentCreatorId={comment.userId}
          contentId={comment.id}
          user={user}
          contentType={'comment'}
          totalLikes={comment.likes ?? 0}
          contract={contract}
          contentText={richTextToString(comment.content)}
          className={
            isBlocked(privateUser, comment.userId) ? 'pointer-events-none' : ''
          }
        />
      )}
      <ReportModal
        report={{
          contentOwnerId: comment.userId,
          contentId: comment.id,
          contentType: 'comment',
          parentId: contract.id,
          parentType: 'contract',
        }}
        setIsModalOpen={setIsModalOpen}
        isModalOpen={isModalOpen}
        label={'Comment'}
      />
      <DropdownMenu
        buttonClass="px-2 py-1"
        Items={buildArray(
          {
            name: 'Copy Link',
            icon: <LinkIcon className="h-5 w-5" />,
            onClick: () => {
              copyLinkToComment(
                contract.creatorUsername,
                contract.slug,
                comment.id
              )
            },
          },
          user && {
            name: 'Report',
            icon: <FlagIcon className="h-5 w-5" />,
            onClick: () => {
              if (user?.id !== comment.userId) setIsModalOpen(true)
              else toast.error(`You can't report your own comment`)
            },
          },
          (isAdmin || isContractCreator) && {
            name: comment.hidden ? 'Unhide' : 'Hide',
            icon: <EyeOffIcon className="h-5 w-5 text-red-500" />,
            onClick: async () => {
              const commentPath = `contracts/${contract.id}/comments/${comment.id}`
              try {
                await hideComment({ commentPath })
              } catch (e: any) {
                toast.error(`Error hiding comment: ${e}`)
              }
            },
          }
        )}
      />
    </Row>
  )
}

function CommentStatus(props: {
  contract: Contract
  comment: ContractComment
}) {
  const { contract, comment } = props
  const { resolutionTime, resolution } = contract
  const {
    commenterPositionProb: prob,
    commenterPositionOutcome,
    commenterPositionShares,
    createdTime,
  } = comment

  if (
    comment.betId == null &&
    prob != null &&
    commenterPositionOutcome != null &&
    commenterPositionShares != null &&
    commenterPositionShares > 0 &&
    contract.outcomeType !== 'NUMERIC'
  )
    return (
      <>
        {resolution ? 'predicted ' : `is predicting `}
        <OutcomeLabel
          outcome={commenterPositionOutcome}
          contract={contract}
          truncate="short"
        />
        {(resolutionTime ? resolutionTime > createdTime : true) &&
          ' at ' + Math.round((prob > 1 ? prob / 100 : prob) * 100) + '%'}
      </>
    )

  return <span />
}

export function ContractCommentInput(props: {
  contract: Contract
  className?: string
  parentAnswerOutcome?: string | undefined
  replyTo?: ReplyTo
  parentCommentId?: string
  onSubmitComment?: () => void
}) {
  const user = useUser()
  const privateUser = usePrivateUser()
  const { contract, parentAnswerOutcome, parentCommentId, replyTo, className } =
    props
  async function onSubmitComment(editor: Editor) {
    if (!user) {
      track('sign in to comment')
      return await firebaseLogin()
    }
    await createCommentOnContract(
      contract.id,
      editor.getJSON(),
      user,
      parentAnswerOutcome,
      parentCommentId
    )
    props.onSubmitComment?.()
  }

  return (
    <CommentInput
      replyTo={replyTo}
      parentAnswerOutcome={parentAnswerOutcome}
      parentCommentId={parentCommentId}
      onSubmitComment={onSubmitComment}
      pageId={contract.id}
      className={className}
      blocked={isBlocked(privateUser, contract.creatorId)}
    />
  )
}

export function FeedCommentHeader(props: {
  comment: ContractComment
  contract: Contract
}) {
  const { comment, contract } = props
  const { userUsername, userName, createdTime } = comment
  const marketCreator = contract.creatorId === comment.userId
  const betOutcome = comment.betOutcome
  let bought: string | undefined
  let money: string | undefined
  if (comment.betAmount != null) {
    bought = comment.betAmount >= 0 ? 'bought' : 'sold'
    money = formatMoney(Math.abs(comment.betAmount))
  }
  const shouldDisplayOutcome = betOutcome && !comment.answerOutcome
  return (
    <span className="text-ink-600 mt-0.5 text-sm">
      <UserLink
        username={userUsername}
        name={userName}
        marketCreator={marketCreator}
      />
      <span className="text-ink-400 ml-1">
        <CommentStatus contract={contract} comment={comment} />
        {bought} {money}
        {shouldDisplayOutcome && (
          <>
            {' '}
            of{' '}
            <OutcomeLabel
              outcome={betOutcome ? betOutcome : ''}
              contract={contract}
              truncate="short"
            />
          </>
        )}
      </span>
      <CopyLinkDateTimeComponent
        prefix={contract.creatorUsername}
        slug={contract.slug}
        createdTime={createdTime}
        elementId={`${COMMENT_ID_PREFIX}${comment.id}`}
      />
    </span>
  )
}
