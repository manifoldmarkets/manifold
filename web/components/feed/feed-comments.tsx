import { Bet } from 'common/bet'
import { Comment } from 'common/comment'
import { User } from 'common/user'
import { Contract } from 'common/contract'
import React, { useEffect, useState } from 'react'
import { minBy, maxBy, groupBy, partition, sumBy, Dictionary } from 'lodash'
import { useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { useRouter } from 'next/router'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { Avatar } from 'web/components/avatar'
import { UserLink } from 'web/components/user-page'
import { OutcomeLabel } from 'web/components/outcome-label'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'
import { contractPath } from 'web/lib/firebase/contracts'
import { firebaseLogin } from 'web/lib/firebase/users'
import { createComment, MAX_COMMENT_LENGTH } from 'web/lib/firebase/comments'
import Textarea from 'react-expanding-textarea'
import { Linkify } from 'web/components/linkify'
import { SiteLink } from 'web/components/site-link'
import { BetStatusText } from 'web/components/feed/feed-bets'
import { Col } from 'web/components/layout/col'
import { getProbability } from 'common/calculate'
import { LoadingIndicator } from 'web/components/loading-indicator'
import { PaperAirplaneIcon } from '@heroicons/react/outline'

export function FeedCommentThread(props: {
  contract: Contract
  comments: Comment[]
  parentComment: Comment
  bets: Bet[]
  truncate?: boolean
  smallAvatar?: boolean
}) {
  const { contract, comments, bets, truncate, smallAvatar, parentComment } =
    props
  const [showReply, setShowReply] = useState(false)
  const [replyToUsername, setReplyToUsername] = useState('')
  const betsByUserId = groupBy(bets, (bet) => bet.userId)
  const user = useUser()
  const commentsList = comments.filter(
    (comment) =>
      parentComment.id && comment.replyToCommentId === parentComment.id
  )
  commentsList.unshift(parentComment)
  const [inputRef, setInputRef] = useState<HTMLTextAreaElement | null>(null)
  function scrollAndOpenReplyInput(comment: Comment) {
    setReplyToUsername(comment.userUsername)
    setShowReply(true)
    inputRef?.focus()
  }
  useEffect(() => {
    if (showReply && inputRef) inputRef.focus()
  }, [inputRef, showReply])
  return (
    <div className={'w-full flex-col pr-1'}>
      <span
        className="absolute top-5 left-5 -ml-px h-[calc(100%-2rem)] w-0.5 bg-gray-200 dark:bg-gray-800"
        aria-hidden="true"
      />
      <CommentRepliesList
        contract={contract}
        commentsList={commentsList}
        betsByUserId={betsByUserId}
        smallAvatar={smallAvatar}
        truncate={truncate}
        bets={bets}
        scrollAndOpenReplyInput={scrollAndOpenReplyInput}
      />
      {showReply && (
        <div className={'-pb-2 ml-6 flex flex-col pt-5'}>
          <span
            className="absolute -ml-[1px] mt-[0.8rem] h-2 w-0.5 rotate-90 bg-gray-200 dark:bg-gray-800"
            aria-hidden="true"
          />
          <CommentInput
            contract={contract}
            betsByCurrentUser={(user && betsByUserId[user.id]) ?? []}
            commentsByCurrentUser={comments.filter(
              (c) => c.userId === user?.id
            )}
            parentCommentId={parentComment.id}
            replyToUsername={replyToUsername}
            parentAnswerOutcome={comments[0].answerOutcome}
            setRef={setInputRef}
            onSubmitComment={() => setShowReply(false)}
          />
        </div>
      )}
    </div>
  )
}

export function CommentRepliesList(props: {
  contract: Contract
  commentsList: Comment[]
  betsByUserId: Dictionary<Bet[]>
  scrollAndOpenReplyInput: (comment: Comment) => void
  bets: Bet[]
  treatFirstIndexEqually?: boolean
  smallAvatar?: boolean
  truncate?: boolean
}) {
  const {
    contract,
    commentsList,
    betsByUserId,
    truncate,
    smallAvatar,
    bets,
    scrollAndOpenReplyInput,
    treatFirstIndexEqually,
  } = props
  return (
    <>
      {commentsList.map((comment, commentIdx) => (
        <div
          key={comment.id}
          id={comment.id}
          className={clsx(
            'relative',
            !treatFirstIndexEqually && commentIdx === 0 ? '' : 'mt-3 ml-6'
          )}
        >
          {/*draw a gray line from the comment to the left:*/}
          {(treatFirstIndexEqually || commentIdx != 0) && (
            <span
              className="absolute -ml-[1px] mt-[0.8rem] h-2 w-0.5 rotate-90 bg-gray-200 dark:bg-gray-800"
              aria-hidden="true"
            />
          )}
          <FeedComment
            contract={contract}
            comment={comment}
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
            smallAvatar={smallAvatar}
            truncate={truncate}
          />
        </div>
      ))}
    </>
  )
}

export function FeedComment(props: {
  contract: Contract
  comment: Comment
  betsBySameUser: Bet[]
  probAtCreatedTime?: number
  truncate?: boolean
  smallAvatar?: boolean
  onReplyClick?: (comment: Comment) => void
}) {
  const {
    contract,
    comment,
    betsBySameUser,
    probAtCreatedTime,
    truncate,
    onReplyClick,
  } = props
  const { text, userUsername, userName, userAvatarUrl, createdTime } = comment
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
      className={clsx(
        'flex space-x-1.5 transition-all duration-1000 sm:space-x-3',
        highlighted ? `-m-1 rounded bg-indigo-500/[0.2] p-2` : ''
      )}
    >
      <Avatar
        className={'ml-1'}
        size={'sm'}
        username={userUsername}
        avatarUrl={userAvatarUrl}
      />
      <div className="min-w-0 flex-1">
        <div className="mt-0.5 pl-0.5 text-sm text-gray-500">
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
          <>
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
          </>
          <CopyLinkDateTimeComponent
            contractCreatorUsername={contract.creatorUsername}
            contractSlug={contract.slug}
            createdTime={createdTime}
            elementId={comment.id}
          />
        </div>
        <TruncatedComment
          comment={text}
          moreHref={contractPath(contract)}
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

export function getMostRecentCommentableBet(
  betsByCurrentUser: Bet[],
  commentsByCurrentUser: Comment[],
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

export function CommentInput(props: {
  contract: Contract
  betsByCurrentUser: Bet[]
  commentsByCurrentUser: Comment[]
  replyToUsername?: string
  setRef?: (ref: HTMLTextAreaElement) => void
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
    parentAnswerOutcome,
    parentCommentId,
    replyToUsername,
    onSubmitComment,
    setRef,
  } = props
  const user = useUser()
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const mostRecentCommentableBet = getMostRecentCommentableBet(
    betsByCurrentUser,
    commentsByCurrentUser,
    user,
    parentAnswerOutcome
  )
  const { id } = mostRecentCommentableBet || { id: undefined }

  useEffect(() => {
    if (!replyToUsername || !user || replyToUsername === user.username) return
    const replacement = `@${replyToUsername} `
    setComment((comment) => replacement + comment.replace(replacement, ''))
  }, [user, replyToUsername])

  async function submitComment(betId: string | undefined) {
    if (!user) {
      return await firebaseLogin()
    }
    if (!comment || isSubmitting) return
    setIsSubmitting(true)
    await createComment(
      contract.id,
      comment,
      user,
      betId,
      parentAnswerOutcome,
      parentCommentId
    )
    onSubmitComment?.()
    setComment('')
    setIsSubmitting(false)
  }

  const { userPosition, outcome } = getBettorsLargestPositionBeforeTime(
    contract,
    Date.now(),
    betsByCurrentUser
  )

  const isNumeric = contract.outcomeType === 'NUMERIC'

  return (
    <>
      <Row className={'mb-2 gap-1 sm:gap-2'}>
        <div className={''}>
          <Avatar
            avatarUrl={user?.avatarUrl}
            username={user?.username}
            size={'sm'}
            className={'ml-1'}
          />
        </div>
        <div className={'min-w-0 flex-1'}>
          <div className="pl-0.5 text-sm text-gray-500">
            <div className={'mb-1'}>
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
              {!mostRecentCommentableBet &&
                user &&
                userPosition > 0 &&
                !isNumeric && (
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

            <Row className="gap-1.5 text-gray-700 dark:text-gray-300">
              <Textarea
                ref={setRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className={clsx(
                  'textarea textarea-bordered w-full resize-none'
                )}
                // Make room for floating submit button.
                style={{ paddingRight: 48 }}
                placeholder={
                  parentCommentId || parentAnswerOutcome
                    ? 'Write a reply... '
                    : 'Write a comment...'
                }
                autoFocus={false}
                maxLength={MAX_COMMENT_LENGTH}
                disabled={isSubmitting}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    submitComment(id)
                    e.currentTarget.blur()
                  }
                }}
              />

              <Col className={clsx('justify-end')}>
                {user && !isSubmitting && (
                  <button
                    className={clsx(
                      'btn btn-ghost btn-sm absolute right-2 flex-row pl-2 capitalize',
                      parentCommentId || parentAnswerOutcome
                        ? ' bottom-4'
                        : ' bottom-2',
                      !comment && 'pointer-events-none text-gray-500'
                    )}
                    onClick={() => {
                      submitComment(id)
                    }}
                  >
                    <PaperAirplaneIcon
                      className={'m-0 min-w-[22px] rotate-90 p-0 '}
                      height={25}
                    />
                  </button>
                )}
                {isSubmitting && (
                  <LoadingIndicator spinnerClassName={'border-gray-500'} />
                )}
              </Col>
            </Row>
            <Row>
              {!user && (
                <button
                  className={'btn btn-outline btn-sm mt-2 normal-case'}
                  onClick={() => submitComment(id)}
                >
                  Sign in to comment
                </button>
              )}
            </Row>
          </div>
        </div>
      </Row>
    </>
  )
}

export function TruncatedComment(props: {
  comment: string
  moreHref: string
  shouldTruncate?: boolean
}) {
  const { comment, moreHref, shouldTruncate } = props
  let truncated = comment

  // Keep descriptions to at most 400 characters
  const MAX_CHARS = 400
  if (shouldTruncate && truncated.length > MAX_CHARS) {
    truncated = truncated.slice(0, MAX_CHARS)
    // Make sure to end on a space
    const i = truncated.lastIndexOf(' ')
    truncated = truncated.slice(0, i)
  }

  return (
    <div
      className="mt-2 whitespace-pre-line break-words text-gray-700 dark:text-gray-300"
      style={{ fontSize: 15 }}
    >
      <Linkify text={truncated} />
      {truncated != comment && (
        <SiteLink href={moreHref} className="text-indigo-700 dark:text-indigo-300">
          ... (show more)
        </SiteLink>
      )}
    </div>
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

  const emptyReturn = {
    userPosition: 0,
    outcome: '',
  }
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
    return emptyReturn
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
