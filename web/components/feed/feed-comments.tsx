import React, { memo, useEffect, useRef, useState } from 'react'
import { Editor } from '@tiptap/react'
import { useRouter } from 'next/router'
import { sum } from 'lodash'
import clsx from 'clsx'

import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
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
import { CommentTipMap } from 'web/hooks/use-tip-txns'
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
import { FlagIcon } from '@heroicons/react/outline'
import { LikeButton } from 'web/components/contract/like-button'
import { richTextToString } from 'common/util/parse'

export type ReplyTo = { id: string; username: string }

export function FeedCommentThread(props: {
  contract: Contract
  threadComments: ContractComment[]
  tips: CommentTipMap
  parentComment: ContractComment
}) {
  const { contract, threadComments, tips, parentComment } = props
  const [replyTo, setReplyTo] = useState<ReplyTo>()
  const [seeReplies, setSeeReplies] = useState(true)
  const [highlightedId, setHighlightedId] = useState<string>()
  const user = useUser()

  const router = useRouter()
  useEffect(() => {
    if (router.isReady) {
      const parts = router.asPath.split('#')
      if (parts.length > 1 && parts[1] != null) {
        setHighlightedId(parts[1])
      } else {
        setHighlightedId(undefined)
      }
    }
  }, [router.isReady, router.asPath])

  const onSeeRepliesClick = useEvent(() => setSeeReplies(!seeReplies))
  const onSubmitComment = useEvent(() => setReplyTo(undefined))
  const onReplyClick = useEvent((comment: ContractComment) => {
    setReplyTo({ id: comment.id, username: comment.userUsername })
  })

  return (
    <Col className="relative w-full items-stretch gap-3 pb-2">
      <ParentFeedComment
        key={parentComment.id}
        contract={contract}
        comment={parentComment}
        highlighted={highlightedId === parentComment.id}
        myTip={user ? tips[parentComment.id]?.[user.id] : undefined}
        totalTip={sum(Object.values(tips[parentComment.id] ?? {}))}
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
            highlighted={highlightedId === comment.id}
            myTip={user ? tips[comment.id]?.[user.id] : undefined}
            totalTip={sum(Object.values(tips[comment.id] ?? {}))}
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

export const ParentFeedComment = memo(function ParentFeedComment(props: {
  contract: Contract
  comment: ContractComment
  highlighted?: boolean
  showLike?: boolean
  myTip?: number
  totalTip?: number
  seeReplies: boolean
  numComments: number
  onReplyClick?: (comment: ContractComment) => void
  onSeeReplyClick: () => void
}) {
  const {
    contract,
    comment,
    highlighted,
    myTip,
    totalTip,
    showLike,
    onReplyClick,
    onSeeReplyClick,
    seeReplies,
    numComments,
  } = props
  const { text, content, userUsername, userAvatarUrl } = comment
  const commentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlighted && commentRef.current) {
      commentRef.current.scrollIntoView(true)
    }
  }, [highlighted])

  const commentKind =
    userUsername === 'ManifoldDream' ? 'ub-dream-comment' : null
  return (
    <Row
      ref={commentRef}
      id={comment.id}
      className={clsx(
        commentKind,
        'relative ml-3 gap-2',
        highlighted ? 'bg-indigo-50' : 'hover:bg-gray-50'
      )}
    >
      <Col className="-ml-3.5">
        <Avatar size="sm" username={userUsername} avatarUrl={userAvatarUrl} />
      </Col>
      <Col className="w-full">
        <FeedCommentHeader comment={comment} contract={contract} />
        <Content size="sm" content={content || text} />
        <Row className="justify-between">
          <ReplyToggle
            seeReplies={seeReplies}
            numComments={numComments}
            onClick={onSeeReplyClick}
          />
          <CommentActions
            onReplyClick={onReplyClick}
            comment={comment}
            showLike={showLike}
            myTip={myTip}
            totalTip={totalTip}
            contract={contract}
          />
        </Row>
      </Col>
    </Row>
  )
})

export function CommentActions(props: {
  onReplyClick?: (comment: ContractComment) => void
  comment: ContractComment
  showLike?: boolean
  myTip?: number
  totalTip?: number
  contract: Contract
}) {
  const { onReplyClick, comment, showLike, contract } = props
  const [isModalOpen, setIsModalOpen] = useState(false)
  const user = useUser()
  return (
    <Row className="grow items-center justify-end">
      {onReplyClick && (
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
        Items={[
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
          {
            name: 'Report',
            icon: <FlagIcon className="h-5 w-5" />,
            onClick: () => {
              if (user?.id !== comment.userId) setIsModalOpen(true)
              else toast.error(`You can't report your own comment`)
            },
          },
        ]}
      />
    </Row>
  )
}

export const FeedComment = memo(function FeedComment(props: {
  contract: Contract
  comment: ContractComment
  highlighted?: boolean
  showLike?: boolean
  myTip?: number
  totalTip?: number
  onReplyClick?: (comment: ContractComment) => void
}) {
  const {
    contract,
    comment,
    highlighted,
    myTip,
    totalTip,
    showLike,
    onReplyClick,
  } = props
  const { text, content, userUsername, userAvatarUrl } = comment
  const commentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlighted && commentRef.current) {
      commentRef.current.scrollIntoView(true)
    }
  }, [highlighted])

  return (
    <Row
      ref={commentRef}
      id={comment.id}
      className={clsx(
        'relative ml-12 gap-2 ',
        highlighted ? 'bg-indigo-50' : 'hover:bg-gray-50'
      )}
    >
      <Col className="-ml-3">
        <Avatar size="xs" username={userUsername} avatarUrl={userAvatarUrl} />
      </Col>
      <Col className="w-full">
        <FeedCommentHeader comment={comment} contract={contract} />
        <Content className="mt-2 grow" size="sm" content={content || text} />
        <CommentActions
          onReplyClick={onReplyClick}
          comment={comment}
          showLike={showLike}
          myTip={myTip}
          totalTip={totalTip}
          contract={contract}
        />
      </Col>
    </Row>
  )
})

function CommentStatus(props: {
  contract: Contract
  outcome: string
  prob?: number
}) {
  const { contract, outcome, prob } = props
  return (
    <>
      {contract.resolution ? 'predicted ' : `is predicting `}
      <OutcomeLabel outcome={outcome} contract={contract} truncate="short" />
      {prob !== undefined ? (
        ' at ' + Math.round((prob > 1 ? prob / 100 : prob) * 100) + '%'
      ) : (
        <div />
      )}
    </>
  )
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
      blocked={privateUser?.blockedByUserIds.includes(contract.creatorId)}
    />
  )
}

export function FeedCommentHeader(props: {
  comment: ContractComment
  contract: Contract
}) {
  const { comment, contract } = props
  const {
    userUsername,
    userName,
    commenterPositionProb,
    commenterPositionShares,
    commenterPositionOutcome,
    createdTime,
  } = comment
  const betOutcome = comment.betOutcome
  let bought: string | undefined
  let money: string | undefined
  if (comment.betAmount != null) {
    bought = comment.betAmount >= 0 ? 'bought' : 'sold'
    money = formatMoney(Math.abs(comment.betAmount))
  }
  return (
    <Row>
      <div className="mt-0.5 text-sm text-gray-600">
        <UserLink username={userUsername} name={userName} />{' '}
        <span className="text-gray-400">
          {comment.betId == null &&
            commenterPositionProb != null &&
            commenterPositionOutcome != null &&
            commenterPositionShares != null &&
            commenterPositionShares > 0 &&
            contract.outcomeType !== 'NUMERIC' && (
              <>
                <CommentStatus
                  prob={commenterPositionProb}
                  outcome={commenterPositionOutcome}
                  contract={contract}
                />
              </>
            )}
          {bought} {money}
          {contract.outcomeType !== 'FREE_RESPONSE' && betOutcome && (
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
          elementId={comment.id}
        />
      </div>
    </Row>
  )
}
