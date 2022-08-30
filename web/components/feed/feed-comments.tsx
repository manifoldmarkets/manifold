import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { User } from 'common/user'
import { Contract } from 'common/contract'
import React, { useEffect, useState } from 'react'
import { minBy, maxBy, partition, sumBy, Dictionary } from 'lodash'
import { useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { useRouter } from 'next/router'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { Avatar } from 'web/components/avatar'
import { UserLink } from 'web/components/user-page'
import { OutcomeLabel } from 'web/components/outcome-label'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { firebaseLogin } from 'web/lib/firebase/users'
import {
  createCommentOnContract,
  MAX_COMMENT_LENGTH,
} from 'web/lib/firebase/comments'
import { BetStatusText } from 'web/components/feed/feed-bets'
import { Col } from 'web/components/layout/col'
import { getProbability } from 'common/calculate'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { PaperAirplaneIcon } from '@heroicons/react/outline'
import { track } from 'web/lib/service/analytics'
import { Tipper } from '../tipper'
import { CommentTipMap, CommentTips } from 'web/hooks/use-tip-txns'
import { useWindowSize } from 'web/hooks/use-window-size'
import { Content, TextEditor, useTextEditor } from '../editor'
import { Editor } from '@tiptap/react'

export function FeedCommentThread(props: {
  user: User | null | undefined
  contract: Contract
  threadComments: ContractComment[]
  tips: CommentTipMap
  parentComment: ContractComment
  bets: Bet[]
  betsByUserId: Dictionary<Bet[]>
  commentsByUserId: Dictionary<ContractComment[]>
}) {
  const {
    user,
    contract,
    threadComments,
    commentsByUserId,
    bets,
    betsByUserId,
    tips,
    parentComment,
  } = props
  const [showReply, setShowReply] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; username: string }>()

  function scrollAndOpenReplyInput(comment: ContractComment) {
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
        <FeedComment
          key={comment.id}
          indent={commentIdx != 0}
          contract={contract}
          comment={comment}
          tips={tips[comment.id]}
          betsBySameUser={betsByUserId[comment.userId] ?? []}
          onReplyClick={scrollAndOpenReplyInput}
          probAtCreatedTime={
            contract.outcomeType === 'BINARY'
              ? minBy(bets, (bet) => {
                  return bet.createdTime < comment.createdTime
                    ? comment.createdTime - bet.createdTime
                    : comment.createdTime
                })?.probAfter
              : undefined
          }
        />
      ))}
      {showReply && (
        <Col className="-pb-2 relative ml-6">
          <span
            className="absolute -left-1 -ml-[1px] mt-[0.8rem] h-2 w-0.5 rotate-90 bg-gray-200"
            aria-hidden="true"
          />
          <CommentInput
            contract={contract}
            betsByCurrentUser={(user && betsByUserId[user.id]) ?? []}
            commentsByCurrentUser={(user && commentsByUserId[user.id]) ?? []}
            parentCommentId={parentComment.id}
            replyToUser={replyTo}
            parentAnswerOutcome={parentComment.answerOutcome}
            onSubmitComment={() => setShowReply(false)}
          />
        </Col>
      )}
    </Col>
  )
}

export function FeedComment(props: {
  contract: Contract
  comment: ContractComment
  tips: CommentTips
  betsBySameUser: Bet[]
  indent?: boolean
  probAtCreatedTime?: number
  onReplyClick?: (comment: ContractComment) => void
}) {
  const {
    contract,
    comment,
    tips,
    betsBySameUser,
    indent,
    probAtCreatedTime,
    onReplyClick,
  } = props
  const { text, content, userUsername, userName, userAvatarUrl, createdTime } =
    comment
  let betOutcome: string | undefined,
    bought: string | undefined,
    money: string | undefined

  const matchedBet = betsBySameUser.find((bet) => bet.id === comment.betId)
  if (matchedBet) {
    betOutcome = matchedBet.outcome
    bought = matchedBet.amount >= 0 ? 'bought' : 'sold'
    money = formatMoney(Math.abs(matchedBet.amount))
  }

  const [highlighted, setHighlighted] = useState(false)
  const router = useRouter()
  useEffect(() => {
    if (router.asPath.endsWith(`#${comment.id}`)) {
      setHighlighted(true)
    }
  }, [comment.id, router.asPath])

  // Only calculated if they don't have a matching bet
  const { userPosition, outcome } = getBettorsLargestPositionBeforeTime(
    contract,
    comment.createdTime,
    matchedBet ? [] : betsBySameUser
  )

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
          {!matchedBet &&
            userPosition > 0 &&
            contract.outcomeType !== 'NUMERIC' && (
              <>
                {'is '}
                <CommentStatus
                  prob={probAtCreatedTime}
                  outcome={outcome}
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
                value={(matchedBet as any).value}
                contract={contract}
                truncate="short"
              />
            </>
          )}
          <CopyLinkDateTimeComponent
            prefix={contract.creatorUsername}
            slug={contract.slug}
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

export function getMostRecentCommentableBet(
  betsByCurrentUser: Bet[],
  commentsByCurrentUser: ContractComment[],
  user?: User | null,
  answerOutcome?: string
) {
  let sortedBetsByCurrentUser = betsByCurrentUser.sort(
    (a, b) => b.createdTime - a.createdTime
  )
  if (answerOutcome) {
    sortedBetsByCurrentUser = sortedBetsByCurrentUser.slice(0, 1)
  }
  return sortedBetsByCurrentUser
    .filter((bet) => {
      if (
        canCommentOnBet(bet, user) &&
        !commentsByCurrentUser.some(
          (comment) => comment.createdTime > bet.createdTime
        )
      ) {
        if (!answerOutcome) return true
        return answerOutcome === bet.outcome
      }
      return false
    })
    .pop()
}

function CommentStatus(props: {
  contract: Contract
  outcome: string
  prob?: number
}) {
  const { contract, outcome, prob } = props
  return (
    <>
      {' betting '}
      <OutcomeLabel outcome={outcome} contract={contract} truncate="short" />
      {prob && ' at ' + Math.round(prob * 100) + '%'}
    </>
  )
}

//TODO: move commentinput and comment input text area into their own files
export function CommentInput(props: {
  contract: Contract
  betsByCurrentUser: Bet[]
  commentsByCurrentUser: ContractComment[]
  className?: string
  replyToUser?: { id: string; username: string }
  // Reply to a free response answer
  parentAnswerOutcome?: string
  // Reply to another comment
  parentCommentId?: string
  onSubmitComment?: () => void
}) {
  const {
    contract,
    betsByCurrentUser,
    commentsByCurrentUser,
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

  const mostRecentCommentableBet = getMostRecentCommentableBet(
    betsByCurrentUser,
    commentsByCurrentUser,
    user,
    parentAnswerOutcome
  )
  const { id } = mostRecentCommentableBet || { id: undefined }

  async function submitComment(betId: string | undefined) {
    if (!user) {
      track('sign in to comment')
      return await firebaseLogin()
    }
    if (!editor || editor.isEmpty || isSubmitting) return
    setIsSubmitting(true)
    await createCommentOnContract(
      contract.id,
      editor.getJSON(),
      user,
      betId,
      parentAnswerOutcome,
      parentCommentId
    )
    onSubmitComment?.()
    setIsSubmitting(false)
  }

  const { userPosition, outcome } = getBettorsLargestPositionBeforeTime(
    contract,
    Date.now(),
    betsByCurrentUser
  )

  const isNumeric = contract.outcomeType === 'NUMERIC'

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
        <div className="mb-1 text-gray-500">
          {mostRecentCommentableBet && (
            <BetStatusText
              contract={contract}
              bet={mostRecentCommentableBet}
              isSelf={true}
              hideOutcome={
                isNumeric || contract.outcomeType === 'FREE_RESPONSE'
              }
            />
          )}
          {!mostRecentCommentableBet && user && userPosition > 0 && !isNumeric && (
            <>
              {"You're"}
              <CommentStatus
                outcome={outcome}
                contract={contract}
                prob={
                  contract.outcomeType === 'BINARY'
                    ? getProbability(contract)
                    : undefined
                }
              />
            </>
          )}
        </div>
        <CommentInputTextArea
          editor={editor}
          upload={upload}
          replyToUser={replyToUser}
          user={user}
          submitComment={submitComment}
          isSubmitting={isSubmitting}
          presetId={id}
        />
      </div>
    </Row>
  )
}

export function CommentInputTextArea(props: {
  user: User | undefined | null
  replyToUser?: { id: string; username: string }
  editor: Editor | null
  upload: Parameters<typeof TextEditor>[0]['upload']
  submitComment: (id?: string) => void
  isSubmitting: boolean
  submitOnEnter?: boolean
  presetId?: string
}) {
  const {
    user,
    editor,
    upload,
    submitComment,
    presetId,
    isSubmitting,
    submitOnEnter,
    replyToUser,
  } = props
  const isMobile = (useWindowSize().width ?? 0) < 768 // TODO: base off input device (keybord vs touch)

  useEffect(() => {
    editor?.setEditable(!isSubmitting)
  }, [isSubmitting, editor])

  const submit = () => {
    submitComment(presetId)
    editor?.commands?.clearContent()
  }

  useEffect(() => {
    if (!editor) {
      return
    }
    // submit on Enter key
    editor.setOptions({
      editorProps: {
        handleKeyDown: (view, event) => {
          if (
            submitOnEnter &&
            event.key === 'Enter' &&
            !event.shiftKey &&
            (!isMobile || event.ctrlKey || event.metaKey) &&
            // mention list is closed
            !(view.state as any).mention$.active
          ) {
            submit()
            event.preventDefault()
            return true
          }
          return false
        },
      },
    })
    // insert at mention and focus
    if (replyToUser) {
      editor
        .chain()
        .setContent({
          type: 'mention',
          attrs: { label: replyToUser.username, id: replyToUser.id },
        })
        .insertContent(' ')
        .focus()
        .run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  return (
    <>
      <TextEditor editor={editor} upload={upload}>
        {user && !isSubmitting && (
          <button
            className="btn btn-ghost btn-sm px-2 disabled:bg-inherit disabled:text-gray-300"
            disabled={!editor || editor.isEmpty}
            onClick={submit}
          >
            <PaperAirplaneIcon className="m-0 h-[25px] min-w-[22px] rotate-90 p-0" />
          </button>
        )}

        {isSubmitting && (
          <LoadingIndicator spinnerClassName={'border-gray-500'} />
        )}
      </TextEditor>
      <Row>
        {!user && (
          <button
            className={'btn btn-outline btn-sm mt-2 normal-case'}
            onClick={() => submitComment(presetId)}
          >
            Add my comment
          </button>
        )}
      </Row>
    </>
  )
}

function getBettorsLargestPositionBeforeTime(
  contract: Contract,
  createdTime: number,
  bets: Bet[]
) {
  let yesFloorShares = 0,
    yesShares = 0,
    noShares = 0,
    noFloorShares = 0

  const previousBets = bets.filter(
    (prevBet) => prevBet.createdTime < createdTime && !prevBet.isAnte
  )

  if (contract.outcomeType === 'FREE_RESPONSE') {
    const answerCounts: { [outcome: string]: number } = {}
    for (const bet of previousBets) {
      if (bet.outcome) {
        if (!answerCounts[bet.outcome]) {
          answerCounts[bet.outcome] = bet.amount
        } else {
          answerCounts[bet.outcome] += bet.amount
        }
      }
    }
    const majorityAnswer =
      maxBy(Object.keys(answerCounts), (outcome) => answerCounts[outcome]) ?? ''
    return {
      userPosition: answerCounts[majorityAnswer] || 0,
      outcome: majorityAnswer,
    }
  }
  if (bets.length === 0) {
    return { userPosition: 0, outcome: '' }
  }

  const [yesBets, noBets] = partition(
    previousBets ?? [],
    (bet) => bet.outcome === 'YES'
  )
  yesShares = sumBy(yesBets, (bet) => bet.shares)
  noShares = sumBy(noBets, (bet) => bet.shares)
  yesFloorShares = Math.floor(yesShares)
  noFloorShares = Math.floor(noShares)

  const userPosition = yesFloorShares || noFloorShares
  const outcome = yesFloorShares > noFloorShares ? 'YES' : 'NO'
  return { userPosition, outcome }
}

function canCommentOnBet(bet: Bet, user?: User | null) {
  const { userId, createdTime, isRedemption } = bet
  const isSelf = user?.id === userId
  // You can comment if your bet was posted in the last hour
  return !isRedemption && isSelf && Date.now() - createdTime < 60 * 60 * 1000
}
