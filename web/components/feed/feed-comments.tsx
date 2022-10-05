import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import React, { useEffect, useRef, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { useRouter } from 'next/router'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { Avatar } from 'web/components/avatar'
import { OutcomeLabel } from 'web/components/outcome-label'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { firebaseLogin } from 'web/lib/firebase/users'
import { createCommentOnContract } from 'web/lib/firebase/comments'
import { Col } from 'web/components/layout/col'
import { track } from 'web/lib/service/analytics'
import { Tipper } from '../tipper'
import { CommentTipMap, CommentTips } from 'web/hooks/use-tip-txns'
import { Content } from '../editor'
import { Editor } from '@tiptap/react'
import { UserLink } from 'web/components/user-link'
import { CommentInput } from '../comment-input'
import { AwardBountyButton } from 'web/components/award-bounty-button'

export type ReplyTo = { id: string; username: string }

export function FeedCommentThread(props: {
  contract: Contract
  threadComments: ContractComment[]
  tips: CommentTipMap
  parentComment: ContractComment
}) {
  const { contract, threadComments, tips, parentComment } = props
  const [replyTo, setReplyTo] = useState<ReplyTo>()

  return (
    <Col className="relative w-full items-stretch gap-3 pb-4">
      <span
        className="absolute top-5 left-4 -ml-px h-[calc(100%-2rem)] w-0.5 bg-gray-200"
        aria-hidden="true"
      />
      {[parentComment].concat(threadComments).map((comment, commentIdx) => (
        <FeedComment
          key={comment.id}
          indent={commentIdx != 0}
          contract={contract}
          comment={comment}
          tips={tips[comment.id] ?? {}}
          onReplyClick={() =>
            setReplyTo({ id: comment.id, username: comment.userUsername })
          }
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
            onSubmitComment={() => setReplyTo(undefined)}
          />
        </Col>
      )}
    </Col>
  )
}

export function FeedComment(props: {
  contract: Contract
  comment: ContractComment
  tips?: CommentTips
  indent?: boolean
  onReplyClick?: () => void
}) {
  const { contract, comment, tips, indent, onReplyClick } = props
  const {
    text,
    content,
    userUsername,
    userName,
    userAvatarUrl,
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
        'relative',
        indent ? 'ml-6' : '',
        highlighted ? `-m-1.5 rounded bg-indigo-500/[0.2] p-1.5` : ''
      )}
    >
      {/*draw a gray line from the comment to the left:*/}
      {indent ? (
        <span
          className="bg-greyscale-2 absolute -left-1 -ml-[1px] mt-[0.8rem] h-2 w-0.5 rotate-90"
          aria-hidden="true"
        />
      ) : null}
      <Avatar size="xs" username={userUsername} avatarUrl={userAvatarUrl} />
      <div>
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
        <Content
          className="mt-2 text-[12px] text-gray-700"
          content={content || text}
          smallImage
        />
        <Row className="mt-2 items-center gap-6 text-xs text-gray-500">
          {onReplyClick && (
            <button
              className="font-bold hover:underline"
              onClick={onReplyClick}
            >
              Reply
            </button>
          )}
          {tips && <Tipper comment={comment} tips={tips} />}
          {(contract.openCommentBounties ?? 0) > 0 && (
            <AwardBountyButton comment={comment} contract={contract} />
          )}
        </Row>
      </div>
    </Row>
  )
}

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
      className={className}
    />
  )
}
