// From https://tailwindui.com/components/application-ui/lists/feeds
import React, { Fragment, useEffect, useRef, useState } from 'react'
import * as _ from 'lodash'
import { Dictionary } from 'lodash'
import {
  BanIcon,
  CheckIcon,
  DotsVerticalIcon,
  LockClosedIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import Textarea from 'react-expanding-textarea'

import { OutcomeLabel } from '../outcome-label'
import {
  Contract,
  contractMetrics,
  contractPath,
  tradingAllowed,
} from 'web/lib/firebase/contracts'
import { useUser } from 'web/hooks/use-user'
import { Linkify } from '../linkify'
import { Row } from '../layout/row'
import { createComment, MAX_COMMENT_LENGTH } from 'web/lib/firebase/comments'
import { formatMoney } from 'common/util/format'
import { Comment } from 'common/comment'
import { BinaryResolutionOrChance } from '../contract/contract-card'
import { SiteLink } from '../site-link'
import { Col } from '../layout/col'
import { UserLink } from '../user-page'
import { Bet } from 'web/lib/firebase/bets'
import { JoinSpans } from '../join-spans'
import BetRow from '../bet-row'
import { Avatar } from '../avatar'
import { ActivityItem } from './activity-items'
import { Binary, CPMM, FullContract } from 'common/contract'
import { useSaveSeenContract } from 'web/hooks/use-seen-contracts'
import { User } from 'common/user'
import { trackClick } from 'web/lib/firebase/tracking'
import { firebaseLogin } from 'web/lib/firebase/users'
import { DAY_MS } from 'common/util/time'
import NewContractBadge from '../new-contract-badge'
import { RelativeTimestamp } from '../relative-timestamp'
import { calculateCpmmSale } from 'common/calculate-cpmm'
import { useRouter } from 'next/router'
import { FeedAnswerCommentGroup } from 'web/components/feed/feed-answer-comment-group'
import { getMostRecentCommentableBet } from 'web/components/feed/feed-comments'
import { CopyLinkDateTimeComponent } from 'web/components/feed/copy-link-date-time'

export function FeedItems(props: {
  contract: Contract
  items: ActivityItem[]
  className?: string
  betRowClassName?: string
}) {
  const { contract, items, className, betRowClassName } = props
  const { outcomeType } = contract

  const ref = useRef<HTMLDivElement | null>(null)
  useSaveSeenContract(ref, contract)

  return (
    <div className={clsx('flow-root', className)} ref={ref}>
      <div className={clsx(tradingAllowed(contract) ? '' : '-mb-6')}>
        {items.map((item, activityItemIdx) => (
          <div key={item.id} className={'relative pb-6'}>
            {activityItemIdx !== items.length - 1 ||
            item.type === 'answergroup' ? (
              <span
                className="absolute top-5 left-5 -ml-px h-[calc(100%-2rem)] w-0.5 bg-gray-200"
                aria-hidden="true"
              />
            ) : null}
            <div className="relative flex items-start space-x-3">
              <FeedItem item={item} />
            </div>
          </div>
        ))}
      </div>
      {outcomeType === 'BINARY' && tradingAllowed(contract) && (
        <BetRow contract={contract} className={clsx('mb-2', betRowClassName)} />
      )}
    </div>
  )
}

export function FeedItem(props: { item: ActivityItem }) {
  const { item } = props

  switch (item.type) {
    case 'question':
      return <FeedQuestion {...item} />
    case 'description':
      return <FeedDescription {...item} />
    case 'comment':
      return <FeedComment {...item} />
    case 'bet':
      return <FeedBet {...item} />
    case 'betgroup':
      return <FeedBetGroup {...item} />
    case 'answergroup':
      return <FeedAnswerCommentGroup {...item} />
    case 'close':
      return <FeedClose {...item} />
    case 'resolve':
      return <FeedResolve {...item} />
    case 'commentInput':
      return <CommentInput {...item} />
    case 'commentThread':
      return <FeedCommentThread {...item} />
  }
}

export function FeedCommentThread(props: {
  contract: Contract
  comments: Comment[]
  parentComment: Comment
  betsByUserId: Dictionary<[Bet, ...Bet[]]>
  truncate?: boolean
  smallAvatar?: boolean
}) {
  const {
    contract,
    comments,
    betsByUserId,
    truncate,
    smallAvatar,
    parentComment,
  } = props
  const [showReply, setShowReply] = useState(false)
  const [replyToUsername, setReplyToUsername] = useState('')
  const user = useUser()
  const commentsList = comments.filter(
    (comment) => comment.replyToCommentId === parentComment.id
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
    <div className={'w-full flex-col flex-col pr-6'}>
      {commentsList.map((comment, commentIdx) => (
        <div
          key={comment.id}
          id={comment.id}
          className={commentIdx === 0 ? '' : 'mt-4 ml-8'}
        >
          <FeedComment
            contract={contract}
            comment={comment}
            betsBySameUser={betsByUserId[comment.userId] ?? []}
            onReplyClick={scrollAndOpenReplyInput}
            smallAvatar={smallAvatar}
            truncate={truncate}
          />
        </div>
      ))}
      {showReply && (
        <div className={'ml-8 w-full pt-6'}>
          <CommentInput
            contract={contract}
            // Should we allow replies to contain recent bet info?
            betsByCurrentUser={(user && betsByUserId[user.id]) ?? []}
            comments={comments}
            parentComment={parentComment}
            replyToUsername={replyToUsername}
            answerOutcome={comments[0].answerOutcome}
            setRef={setInputRef}
          />
        </div>
      )}
    </div>
  )
}

export function FeedComment(props: {
  contract: Contract
  comment: Comment
  betsBySameUser: Bet[]
  truncate?: boolean
  smallAvatar?: boolean
  onReplyClick?: (comment: Comment) => void
}) {
  const {
    contract,
    comment,
    betsBySameUser,
    truncate,
    smallAvatar,
    onReplyClick,
  } = props
  const { text, userUsername, userName, userAvatarUrl, createdTime } = comment
  let outcome: string | undefined,
    bought: string | undefined,
    money: string | undefined

  const matchedBet = betsBySameUser.find((bet) => bet.id === comment.betId)
  if (matchedBet) {
    outcome = matchedBet.outcome
    bought = matchedBet.amount >= 0 ? 'bought' : 'sold'
    money = formatMoney(Math.abs(matchedBet.amount))
  }

  const [highlighted, setHighlighted] = useState(false)
  const router = useRouter()
  useEffect(() => {
    if (router.asPath.includes(`#${comment.id}`)) {
      setHighlighted(true)
    }
  }, [router.asPath])

  // Only calculated if they don't have a matching bet
  const { userPosition, userPositionMoney, yesFloorShares, noFloorShares } =
    getBettorsPosition(
      contract,
      comment.createdTime,
      matchedBet ? [] : betsBySameUser
    )

  return (
    <Row
      className={clsx(
        'flex space-x-3 transition-all duration-1000',
        highlighted ? `-m-2 rounded bg-indigo-500/[0.2] p-2` : ''
      )}
    >
      <Avatar
        className={clsx(smallAvatar && 'ml-1')}
        size={smallAvatar ? 'sm' : undefined}
        username={userUsername}
        avatarUrl={userAvatarUrl}
      />
      <div className="min-w-0 flex-1">
        <p className="mt-0.5 text-sm text-gray-500">
          <UserLink
            className="text-gray-500"
            username={userUsername}
            name={userName}
          />{' '}
          {!matchedBet && userPosition > 0 && (
            <>
              {'had ' + userPositionMoney + ' '}
              <>
                {' of '}
                <OutcomeLabel
                  outcome={yesFloorShares > noFloorShares ? 'YES' : 'NO'}
                  contract={contract}
                  truncate="short"
                />
              </>
            </>
          )}
          <>
            {bought} {money}
            {contract.outcomeType !== 'FREE_RESPONSE' && outcome && (
              <>
                {' '}
                of{' '}
                <OutcomeLabel
                  outcome={outcome ? outcome : ''}
                  contract={contract}
                  truncate="short"
                />
              </>
            )}
          </>
          <CopyLinkDateTimeComponent
            contract={contract}
            createdTime={createdTime}
            elementId={comment.id}
          />
        </p>
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

export function CommentInput(props: {
  contract: Contract
  betsByCurrentUser: Bet[]
  comments: Comment[]
  // Tie a comment to an free response answer outcome
  answerOutcome?: string
  // Tie a comment to another comment
  parentComment?: Comment
  replyToUsername?: string
  setRef?: (ref: HTMLTextAreaElement) => void
}) {
  const {
    contract,
    betsByCurrentUser,
    comments,
    answerOutcome,
    parentComment,
    replyToUsername,
    setRef,
  } = props
  const user = useUser()
  const [comment, setComment] = useState('')
  const [focused, setFocused] = useState(false)

  const mostRecentCommentableBet = getMostRecentCommentableBet(
    betsByCurrentUser,
    comments,
    user,
    answerOutcome
  )
  const { id } = mostRecentCommentableBet || { id: undefined }

  useEffect(() => {
    if (!replyToUsername || !user || replyToUsername === user.username) return
    const replacement = `@${replyToUsername} `
    setComment(replacement + comment.replace(replacement, ''))
  }, [user, replyToUsername])

  async function submitComment(betId: string | undefined) {
    if (!user) {
      return await firebaseLogin()
    }
    if (!comment) return

    // Update state asap to avoid double submission.
    const commentValue = comment.toString()
    setComment('')
    await createComment(
      contract.id,
      commentValue,
      user,
      betId,
      answerOutcome,
      parentComment?.id
    )
  }

  const { userPosition, userPositionMoney, yesFloorShares, noFloorShares } =
    getBettorsPosition(contract, Date.now(), betsByCurrentUser)

  const shouldCollapseAfterClickOutside = false

  return (
    <>
      <Row className={'mb-2 flex w-full gap-2'}>
        <div className={'mt-1'}>
          <Avatar avatarUrl={user?.avatarUrl} username={user?.username} />
        </div>
        <div className={'min-w-0 flex-1'}>
          <div className="text-sm text-gray-500">
            <div className={'mb-1'}>
              {mostRecentCommentableBet && (
                <BetStatusText
                  contract={contract}
                  bet={mostRecentCommentableBet}
                  isSelf={true}
                  hideOutcome={contract.outcomeType === 'FREE_RESPONSE'}
                />
              )}
              {!mostRecentCommentableBet && user && userPosition > 0 && (
                <>
                  {'You have ' + userPositionMoney + ' '}
                  <>
                    {' of '}
                    <OutcomeLabel
                      outcome={yesFloorShares > noFloorShares ? 'YES' : 'NO'}
                      contract={contract}
                      truncate="short"
                    />
                  </>
                </>
              )}
            </div>

            <Row className="gap-1.5">
              <Textarea
                ref={(ref: HTMLTextAreaElement) => setRef?.(ref)}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="textarea textarea-bordered w-full resize-none"
                placeholder={
                  parentComment || answerOutcome
                    ? 'Write a reply... '
                    : 'Write a comment...'
                }
                autoFocus={focused}
                rows={focused ? 3 : 1}
                onFocus={() => setFocused(true)}
                onBlur={() =>
                  shouldCollapseAfterClickOutside && setFocused(false)
                }
                maxLength={MAX_COMMENT_LENGTH}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    submitComment(id)
                  }
                }}
              />
              <div
                className={clsx(
                  'flex justify-center',
                  focused ? 'items-end' : 'items-center'
                )}
              >
                {!user && (
                  <button
                    className={
                      'btn btn-outline btn-sm text-transform: capitalize'
                    }
                    onClick={() => submitComment(id)}
                  >
                    Sign in to Comment
                  </button>
                )}
                {user && (
                  <button
                    className={clsx(
                      'btn text-transform: block capitalize',
                      focused && comment
                        ? 'btn-outline btn-sm '
                        : 'btn-ghost btn-sm text-gray-500'
                    )}
                    onClick={() => {
                      if (!focused) return
                      else {
                        submitComment(id)
                        setFocused(false)
                      }
                    }}
                  >
                    {parentComment || answerOutcome ? 'Reply' : 'Comment'}
                  </button>
                )}
              </div>
            </Row>
          </div>
        </div>
      </Row>
    </>
  )
}

function getBettorsPosition(
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
    userPositionMoney: 0,
    yesFloorShares,
    noFloorShares,
  }

  // TODO: show which of the answers was their majority stake at time of comment for FR?
  if (contract.outcomeType != 'BINARY') {
    return emptyReturn
  }
  if (bets.length === 0) {
    return emptyReturn
  }

  // Calculate the majority shares they had when they made the comment
  const betsBefore = bets.filter((prevBet) => prevBet.createdTime < createdTime)
  const [yesBets, noBets] = _.partition(
    betsBefore ?? [],
    (bet) => bet.outcome === 'YES'
  )
  yesShares = _.sumBy(yesBets, (bet) => bet.shares)
  noShares = _.sumBy(noBets, (bet) => bet.shares)
  yesFloorShares = Math.floor(yesShares)
  noFloorShares = Math.floor(noShares)

  const userPosition = yesFloorShares || noFloorShares
  const { saleValue } = calculateCpmmSale(
    contract as FullContract<CPMM, Binary>,
    yesShares || noShares,
    yesFloorShares > noFloorShares ? 'YES' : 'NO'
  )
  const userPositionMoney = formatMoney(Math.abs(saleValue))
  return { userPosition, userPositionMoney, yesFloorShares, noFloorShares }
}

export function FeedBet(props: {
  contract: Contract
  bet: Bet
  hideOutcome: boolean
  smallAvatar: boolean
  bettor?: User // If set: reveal bettor identity
}) {
  const { contract, bet, hideOutcome, smallAvatar, bettor } = props
  const { userId } = bet
  const user = useUser()
  const isSelf = user?.id === userId

  return (
    <>
      <Row className={'flex w-full gap-2 pt-3'}>
        {isSelf ? (
          <Avatar
            className={clsx(smallAvatar && 'ml-1')}
            size={smallAvatar ? 'sm' : undefined}
            avatarUrl={user.avatarUrl}
            username={user.username}
          />
        ) : bettor ? (
          <Avatar
            className={clsx(smallAvatar && 'ml-1')}
            size={smallAvatar ? 'sm' : undefined}
            avatarUrl={bettor.avatarUrl}
            username={bettor.username}
          />
        ) : (
          <div className="relative px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
              <UserIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
            </div>
          </div>
        )}
        <div className={'min-w-0 flex-1 py-1.5'}>
          <BetStatusText
            bet={bet}
            contract={contract}
            isSelf={isSelf}
            bettor={bettor}
            hideOutcome={hideOutcome}
          />
        </div>
      </Row>
    </>
  )
}

function BetStatusText(props: {
  contract: Contract
  bet: Bet
  isSelf: boolean
  bettor?: User
  hideOutcome?: boolean
}) {
  const { bet, contract, bettor, isSelf, hideOutcome } = props
  const { amount, outcome, createdTime } = bet

  const bought = amount >= 0 ? 'bought' : 'sold'
  const money = formatMoney(Math.abs(amount))

  return (
    <div className="text-sm text-gray-500">
      <span>{isSelf ? 'You' : bettor ? bettor.name : 'A trader'}</span> {bought}{' '}
      {money}
      {!hideOutcome && (
        <>
          {' '}
          of{' '}
          <OutcomeLabel
            outcome={outcome}
            contract={contract}
            truncate="short"
          />
        </>
      )}
      <RelativeTimestamp time={createdTime} />
    </div>
  )
}

function TruncatedComment(props: {
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
      className="mt-2 whitespace-pre-line break-words text-gray-700"
      style={{ fontSize: 15 }}
    >
      <Linkify text={truncated} />
      {truncated != comment && (
        <SiteLink href={moreHref} className="text-indigo-700">
          ... (show more)
        </SiteLink>
      )}
    </div>
  )
}

export function FeedQuestion(props: {
  contract: Contract
  showDescription: boolean
  contractPath?: string
}) {
  const { contract, showDescription } = props
  const {
    creatorName,
    creatorUsername,
    question,
    outcomeType,
    volume,
    createdTime,
  } = contract
  const { volumeLabel } = contractMetrics(contract)
  const isBinary = outcomeType === 'BINARY'
  const isNew = createdTime > Date.now() - DAY_MS

  return (
    <>
      <Avatar
        username={contract.creatorUsername}
        avatarUrl={contract.creatorAvatarUrl}
      />
      <div className="min-w-0 flex-1 py-1.5">
        <div className="mb-2 text-sm text-gray-500">
          <UserLink
            className="text-gray-900"
            name={creatorName}
            username={creatorUsername}
          />{' '}
          asked
          {/* Currently hidden on mobile; ideally we'd fit this in somewhere. */}
          <div className="relative -top-2 float-right ">
            {isNew || volume === 0 ? (
              <NewContractBadge />
            ) : (
              <span className="hidden text-gray-400 sm:inline">
                {volumeLabel}
              </span>
            )}
          </div>
        </div>
        <Col className="items-start justify-between gap-2 sm:flex-row sm:gap-4">
          <SiteLink
            href={
              props.contractPath ? props.contractPath : contractPath(contract)
            }
            onClick={() => trackClick(contract.id)}
            className="text-lg text-indigo-700 sm:text-xl"
          >
            {question}
          </SiteLink>
          {isBinary && (
            <BinaryResolutionOrChance
              className="items-center"
              contract={contract}
            />
          )}
        </Col>
        {showDescription && (
          <TruncatedComment
            comment={contract.description}
            moreHref={contractPath(contract)}
            shouldTruncate
          />
        )}
      </div>
    </>
  )
}

function FeedDescription(props: { contract: Contract }) {
  const { contract } = props
  const { creatorName, creatorUsername } = contract
  const user = useUser()
  const isCreator = user?.id === contract.creatorId

  return (
    <>
      <Avatar
        username={contract.creatorUsername}
        avatarUrl={contract.creatorAvatarUrl}
      />
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500">
          <UserLink
            className="text-gray-900"
            name={creatorName}
            username={creatorUsername}
          />{' '}
          created this market <RelativeTimestamp time={contract.createdTime} />
        </div>
      </div>
    </>
  )
}

function OutcomeIcon(props: { outcome?: string }) {
  const { outcome } = props
  switch (outcome) {
    case 'YES':
      return <CheckIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
    case 'NO':
      return <XIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
    case 'CANCEL':
      return <BanIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
    default:
      return <CheckIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
  }
}

function FeedResolve(props: { contract: Contract }) {
  const { contract } = props
  const { creatorName, creatorUsername } = contract
  const resolution = contract.resolution || 'CANCEL'

  return (
    <>
      <div>
        <div className="relative px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
            <OutcomeIcon outcome={resolution} />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500">
          <UserLink
            className="text-gray-900"
            name={creatorName}
            username={creatorUsername}
          />{' '}
          resolved this market to{' '}
          <OutcomeLabel
            outcome={resolution}
            contract={contract}
            truncate="long"
          />{' '}
          <RelativeTimestamp time={contract.resolutionTime || 0} />
        </div>
      </div>
    </>
  )
}

function FeedClose(props: { contract: Contract }) {
  const { contract } = props

  return (
    <>
      <div>
        <div className="relative px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
            <LockClosedIcon
              className="h-5 w-5 text-gray-500"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500">
          Trading closed in this market{' '}
          <RelativeTimestamp time={contract.closeTime || 0} />
        </div>
      </div>
    </>
  )
}

function BetGroupSpan(props: {
  contract: Contract
  bets: Bet[]
  outcome?: string
}) {
  const { contract, bets, outcome } = props

  const numberTraders = _.uniqBy(bets, (b) => b.userId).length

  const [buys, sells] = _.partition(bets, (bet) => bet.amount >= 0)
  const buyTotal = _.sumBy(buys, (b) => b.amount)
  const sellTotal = _.sumBy(sells, (b) => -b.amount)

  return (
    <span>
      {numberTraders} {numberTraders > 1 ? 'traders' : 'trader'}{' '}
      <JoinSpans>
        {buyTotal > 0 && <>bought {formatMoney(buyTotal)} </>}
        {sellTotal > 0 && <>sold {formatMoney(sellTotal)} </>}
      </JoinSpans>
      {outcome && (
        <>
          {' '}
          of{' '}
          <OutcomeLabel
            outcome={outcome}
            contract={contract}
            truncate="short"
          />
        </>
      )}{' '}
    </span>
  )
}

function FeedBetGroup(props: {
  contract: Contract
  bets: Bet[]
  hideOutcome: boolean
}) {
  const { contract, bets, hideOutcome } = props

  const betGroups = _.groupBy(bets, (bet) => bet.outcome)
  const outcomes = Object.keys(betGroups)

  // Use the time of the last bet for the entire group
  const createdTime = bets[bets.length - 1].createdTime

  return (
    <>
      <div>
        <div className="relative px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
            <UsersIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className={clsx('min-w-0 flex-1', outcomes.length === 1 && 'mt-1')}>
        <div className="text-sm text-gray-500">
          {outcomes.map((outcome, index) => (
            <Fragment key={outcome}>
              <BetGroupSpan
                contract={contract}
                outcome={hideOutcome ? undefined : outcome}
                bets={betGroups[outcome]}
              />
              {index !== outcomes.length - 1 && <br />}
            </Fragment>
          ))}
          <RelativeTimestamp time={createdTime} />
        </div>
      </div>
    </>
  )
}

// TODO: Should highlight the entire Feed segment
function FeedExpand(props: { setExpanded: (expanded: boolean) => void }) {
  const { setExpanded } = props
  return (
    <>
      <button onClick={() => setExpanded(true)}>
        <div className="relative px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300">
            <DotsVerticalIcon
              className="h-5 w-5 text-gray-500"
              aria-hidden="true"
            />
          </div>
        </div>
      </button>

      <button onClick={() => setExpanded(true)}>
        <div className="min-w-0 flex-1 py-1.5">
          <div className="text-sm text-gray-500 hover:text-gray-700">
            <span>Show all activity</span>
          </div>
        </div>
      </button>
    </>
  )
}
