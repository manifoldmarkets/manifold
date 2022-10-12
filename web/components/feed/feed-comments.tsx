import React, { memo, useEffect, useRef, useState } from 'react'
import { Editor } from '@tiptap/react'
import { useRouter } from 'next/router'
import { sum } from 'lodash'
import clsx from 'clsx'

import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/avatar'
import { OutcomeLabel } from 'web/components/outcome-label'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { firebaseLogin } from 'web/lib/firebase/users'
import { createCommentOnContract } from 'web/lib/firebase/comments'
import { Col } from 'web/components/layout/col'
import { track } from 'web/lib/service/analytics'
import { Tipper } from '../tipper'
import { CommentTipMap } from 'web/hooks/use-tip-txns'
import { useEvent } from 'web/hooks/use-event'
import { Content } from '../editor'
import { UserLink } from 'web/components/user-link'
import { CommentInput } from '../comment-input'
import { AwardBountyButton } from 'web/components/award-bounty-button'
import { ReplyIcon } from '@heroicons/react/solid'
import { Button } from '../button'
import { ReplyToggle } from '../comments/comments'

export type ReplyTo = { id: string; username: string }

export function FeedCommentThread(props: {
  contract: Contract
  threadComments: ContractComment[]
  tips: CommentTipMap
  parentComment: ContractComment
}) {
  const { contract, threadComments, tips, parentComment } = props
  const [replyTo, setReplyTo] = useState<ReplyTo>()
  const [seeReplies, setSeeReplies] = useState(false)

  const user = useUser()
  const onSubmitComment = useEvent(() => setReplyTo(undefined))
  const onReplyClick = useEvent((comment: ContractComment) => {
    setReplyTo({ id: comment.id, username: comment.userUsername })
  })

  return (
    <Col className="relative w-full items-stretch gap-3 pb-4">
      <ParentFeedComment
        key={parentComment.id}
        contract={contract}
        comment={parentComment}
        myTip={user ? tips[parentComment.id]?.[user.id] : undefined}
        totalTip={sum(Object.values(tips[parentComment.id] ?? {}))}
        showTip={true}
        seeReplies={seeReplies}
        numComments={threadComments.length}
        onSeeReplyClick={() => setSeeReplies(!seeReplies)}
        onReplyClick={() =>
          setReplyTo({
            id: parentComment.id,
            username: parentComment.userUsername,
          })
        }
      />
      {seeReplies &&
        threadComments.map((comment, _commentIdx) => (
          <FeedComment
            key={comment.id}
            contract={contract}
            comment={comment}
            myTip={user ? tips[comment.id]?.[user.id] : undefined}
            totalTip={sum(Object.values(tips[comment.id] ?? {}))}
            showTip={true}
            onReplyClick={onReplyClick}
          />
        ))}
      {replyTo && (
        <Col className="-pb-2 relative ml-6">
          <span
            className="absolute -left-1 -ml-[1px] mt-[0.8rem] h-2 w-0.5 rotate-90 bg-gray-200"
            aria-hidden="true"
          />
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

export function ParentFeedComment(props: {
  contract: Contract
  comment: ContractComment
  showTip?: boolean
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
    myTip,
    totalTip,
    showTip,
    onReplyClick,
    onSeeReplyClick,
    seeReplies,
    numComments,
  } = props
  const { text, content, userUsername, userAvatarUrl } = comment

  const router = useRouter()
  const highlighted = router.asPath.endsWith(`#${comment.id}`)
  const commentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlighted && commentRef.current != null) {
      commentRef.current.scrollIntoView(true)
    }
  }, [highlighted])

  return (
    <Row
      ref={commentRef}
      id={comment.id}
      className={clsx(
        'hover:bg-greyscale-1 ml-3 gap-2 transition-colors',
        highlighted ? `-m-1.5 rounded bg-indigo-500/[0.2] p-1.5` : ''
      )}
    >
      <Col className="-ml-3.5">
        <Avatar size="sm" username={userUsername} avatarUrl={userAvatarUrl} />
      </Col>
      <Col className="w-full">
        <FeedCommentHeader comment={comment} contract={contract} />
        {/* TODO: bug where if this is iFrame, it does not scroll */}
        <Content
          className="text-greyscale-7 mt-2 grow text-[14px]"
          content={content || text}
          smallImage
        />
        <Row className="justify-between">
          <ReplyToggle
            seeReplies={seeReplies}
            numComments={numComments}
            onClick={onSeeReplyClick}
          />
          <Row className="grow justify-end gap-2">
            {onReplyClick && (
              <Button
                size={'sm'}
                className={clsx(
                  'hover:bg-greyscale-2 mt-0 mb-1 max-w-xs px-0 py-0'
                )}
                color={'gray-white'}
                onClick={() => onReplyClick(comment)}
              >
                <ReplyIcon className="h-5 w-5" />
              </Button>
            )}
            {showTip && (
              <Tipper
                comment={comment}
                myTip={myTip ?? 0}
                totalTip={totalTip ?? 0}
              />
            )}
            {(contract.openCommentBounties ?? 0) > 0 && (
              <AwardBountyButton comment={comment} contract={contract} />
            )}
          </Row>
        </Row>
      </Col>
    </Row>
  )
}

export const FeedComment = memo(function FeedComment(props: {
  contract: Contract
  comment: ContractComment
  showTip?: boolean
  myTip?: number
  totalTip?: number
  onReplyClick?: (comment: ContractComment) => void
}) {
  const { contract, comment, myTip, totalTip, showTip, onReplyClick } = props
  const { text, content, userUsername, userAvatarUrl } = comment
  const { isReady, asPath } = useRouter()
  const [highlighted, setHighlighted] = useState(false)
  const commentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isReady && asPath.endsWith(`#${comment.id}`)) {
      setHighlighted(true)
    }
  }, [isReady, asPath, comment.id])

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
        'hover:bg-greyscale-1 ml-10 gap-2 transition-colors',
        highlighted ? `-m-1.5 rounded bg-indigo-500/[0.2] p-1.5` : ''
      )}
    >
      <Col className="-ml-3">
        <Avatar size="xs" username={userUsername} avatarUrl={userAvatarUrl} />
        <span
          className="bg-greyscale-3 mx-auto h-full w-[1.5px]"
          aria-hidden="true"
        />
      </Col>
      <Col className="w-full">
        <FeedCommentHeader comment={comment} contract={contract} />
        <Content
          className="text-greyscale-7 mt-2 grow text-[14px]"
          content={content || text}
          smallImage
        />
        <Row className="justify-end">
          {onReplyClick && (
            <Button
              color="gray-white"
              size="2xs"
              onClick={() => onReplyClick(comment)}
            >
              <ReplyIcon className="h-4 w-4" />
            </Button>
          )}
          {showTip && (
            <Tipper
              comment={comment}
              myTip={myTip ?? 0}
              totalTip={totalTip ?? 0}
            />
          )}
          {(contract.openCommentBounties ?? 0) > 0 && (
            <AwardBountyButton comment={comment} contract={contract} />
          )}
        </Row>
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
      {` predicting `}
      <OutcomeLabel outcome={outcome} contract={contract} truncate="short" />
      {prob && ' at ' + Math.round(prob * 100) + '%'}
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
  const { contract, parentAnswerOutcome, parentCommentId, replyTo, className } =
    props
  const { openCommentBounties } = contract
  async function onSubmitComment(editor: Editor) {
    if (!user) {
      track('sign in to comment')
      return await firebaseLogin()
    }
    await createCommentOnContract(
      contract.id,
      editor.getJSON(),
      user,
      !!openCommentBounties,
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
    bountiesAwarded,
  } = comment
  const betOutcome = comment.betOutcome
  let bought: string | undefined
  let money: string | undefined
  if (comment.betAmount != null) {
    bought = comment.betAmount >= 0 ? 'bought' : 'sold'
    money = formatMoney(Math.abs(comment.betAmount))
  }
  const totalAwarded = bountiesAwarded ?? 0
  return (
    <Row>
      <div className="text-greyscale-6 mt-0.5 text-xs">
        <UserLink username={userUsername} name={userName} />{' '}
        <span className="text-greyscale-4">
          {comment.betId == null &&
            commenterPositionProb != null &&
            commenterPositionOutcome != null &&
            commenterPositionShares != null &&
            commenterPositionShares > 0 &&
            contract.outcomeType !== 'NUMERIC' && (
              <>
                {'is '}
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
        {totalAwarded > 0 && (
          <span className=" text-primary ml-2 text-sm">
            +{formatMoney(totalAwarded)}
          </span>
        )}
      </div>
    </Row>
  )
}
