// From https://tailwindui.com/components/application-ui/lists/feeds
import React, { Fragment, useRef, useState } from 'react'
import * as _ from 'lodash'
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
  contractMetrics,
  Contract,
  contractPath,
  tradingAllowed,
} from '../../lib/firebase/contracts'
import { useUser } from '../../hooks/use-user'
import { Linkify } from '../linkify'
import { Row } from '../layout/row'
import { createComment, MAX_COMMENT_LENGTH } from '../../lib/firebase/comments'
import { formatMoney, formatPercent } from '../../../common/util/format'
import { Comment } from '../../../common/comment'
import { BinaryResolutionOrChance } from '../contract/contract-card'
import { SiteLink } from '../site-link'
import { Col } from '../layout/col'
import { UserLink } from '../user-page'
import { DateTimeTooltip } from '../datetime-tooltip'
import { Bet } from '../../lib/firebase/bets'
import { JoinSpans } from '../join-spans'
import { fromNow } from '../../lib/util/time'
import BetRow from '../bet-row'
import { Avatar } from '../avatar'
import { Answer } from '../../../common/answer'
import { ActivityItem } from './activity-items'
import {
  Binary,
  CPMM,
  DPM,
  FreeResponse,
  FullContract,
} from '../../../common/contract'
import { BuyButton } from '../yes-no-selector'
import { getDpmOutcomeProbability } from '../../../common/calculate-dpm'
import { AnswerBetPanel } from '../answers/answer-bet-panel'
import { useSaveSeenContract } from '../../hooks/use-seen-contracts'
import { User } from '../../../common/user'
import { Modal } from '../layout/modal'
import { trackClick } from '../../lib/firebase/tracking'
import { firebaseLogin } from '../../lib/firebase/users'
import { DAY_MS } from '../../../common/util/time'
import NewContractBadge from '../new-contract-badge'
import { calculateCpmmSale } from '../../../common/calculate-cpmm'

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
    <div className={clsx('flow-root pr-2 md:pr-0', className)} ref={ref}>
      <div className={clsx(tradingAllowed(contract) ? '' : '-mb-6')}>
        {items.map((item, activityItemIdx) => (
          <div
            key={item.id}
            className={
              item.type === 'answer' ? 'relative pb-2' : 'relative pb-6'
            }
          >
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

function FeedItem(props: { item: ActivityItem }) {
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
      return <FeedAnswerGroup {...item} />
    case 'answer':
      return <FeedAnswerGroup {...item} />
    case 'close':
      return <FeedClose {...item} />
    case 'resolve':
      return <FeedResolve {...item} />
    case 'commentInput':
      return <CommentInput {...item} />
  }
}

export function FeedComment(props: {
  contract: Contract
  comment: Comment
  betsBySameUser: Bet[]
  hideOutcome: boolean
  truncate: boolean
  smallAvatar: boolean
}) {
  const {
    contract,
    comment,
    betsBySameUser,
    hideOutcome,
    truncate,
    smallAvatar,
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

  // Only calculated if they don't have a matching bet
  const { userPosition, userPositionMoney, yesFloorShares, noFloorShares } =
    getBettorsPosition(
      contract,
      comment.createdTime,
      matchedBet ? [] : betsBySameUser
    )

  return (
    <>
      <Avatar
        className={clsx(smallAvatar && 'ml-1')}
        size={smallAvatar ? 'sm' : undefined}
        username={userUsername}
        avatarUrl={userAvatarUrl}
      />
      <div className="min-w-0 flex-1">
        <div>
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
              {outcome && !hideOutcome && (
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
            <RelativeTimestamp time={createdTime} />
          </p>
        </div>
        <TruncatedComment
          comment={text}
          moreHref={contractPath(contract)}
          shouldTruncate={truncate}
        />
      </div>
    </>
  )
}

export function CommentInput(props: {
  contract: Contract
  betsByCurrentUser: Bet[]
  comments: Comment[]
}) {
  const { contract, betsByCurrentUser, comments } = props
  const user = useUser()
  const [comment, setComment] = useState('')

  async function submitComment() {
    if (!comment) return
    if (!user) {
      return await firebaseLogin()
    }
    await createComment(contract.id, comment, user)
    setComment('')
  }

  // Should this be oldest bet or most recent bet?
  const mostRecentCommentableBet = betsByCurrentUser
    .filter(
      (bet) =>
        canCommentOnBet(bet.userId, bet.createdTime, user) &&
        !comments.some((comment) => comment.betId == bet.id)
    )
    .sort((b1, b2) => b1.createdTime - b2.createdTime)
    .pop()

  if (mostRecentCommentableBet) {
    return (
      <FeedBet
        contract={contract}
        bet={mostRecentCommentableBet}
        hideOutcome={false}
        smallAvatar={false}
      />
    )
  }
  const { userPosition, userPositionMoney, yesFloorShares, noFloorShares } =
    getBettorsPosition(contract, Date.now(), betsByCurrentUser)

  return (
    <>
      <Row className={'flex w-full gap-2 pt-3'}>
        <div>
          <Avatar avatarUrl={user?.avatarUrl} username={user?.username} />
        </div>
        <div className={'min-w-0 flex-1 py-1.5'}>
          <div className="text-sm text-gray-500">
            {user && userPosition > 0 && (
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
            <div className="mt-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="textarea textarea-bordered w-full resize-none"
                placeholder="Add a comment..."
                rows={3}
                maxLength={MAX_COMMENT_LENGTH}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    submitComment()
                  }
                }}
              />
              <button
                className={
                  'btn btn-outline btn-sm text-transform: mt-1 capitalize'
                }
                onClick={submitComment}
              >
                {user ? 'Comment' : 'Sign in to comment'}
              </button>
            </div>
          </div>
        </div>
      </Row>
    </>
  )
}

export function RelativeTimestamp(props: { time: number }) {
  const { time } = props
  return (
    <DateTimeTooltip time={time}>
      <span className="ml-1 whitespace-nowrap text-gray-400">
        {fromNow(time)}
      </span>
    </DateTimeTooltip>
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
  hideComment?: boolean
  bettor?: User // If set: reveal bettor identity
}) {
  const { contract, bet, hideOutcome, smallAvatar, bettor, hideComment } = props
  const { id, amount, outcome, createdTime, userId } = bet
  const user = useUser()
  const isSelf = user?.id === userId
  const canComment = canCommentOnBet(userId, createdTime, user) && !hideComment

  const [comment, setComment] = useState('')
  async function submitComment() {
    if (!user || !comment || !canComment) return
    await createComment(contract.id, comment, user, id)
  }

  const bought = amount >= 0 ? 'bought' : 'sold'
  const money = formatMoney(Math.abs(amount))

  return (
    <>
      <Row className={'flex w-full gap-2 pt-3'}>
        <div>
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
                <UserIcon
                  className="h-5 w-5 text-gray-500"
                  aria-hidden="true"
                />
              </div>
            </div>
          )}
        </div>
        <div className={'min-w-0 flex-1 py-1.5'}>
          <div className="text-sm text-gray-500">
            <span>{isSelf ? 'You' : bettor ? bettor.name : 'A trader'}</span>{' '}
            {bought} {money}
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
            {(canComment || comment) && (
              <div className="mt-2">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="textarea textarea-bordered w-full resize-none"
                  placeholder="Add a comment..."
                  rows={3}
                  maxLength={MAX_COMMENT_LENGTH}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      submitComment()
                    }
                  }}
                />
                <button
                  className="btn btn-outline btn-sm text-transform: mt-1 capitalize"
                  onClick={submitComment}
                  disabled={!canComment}
                >
                  Comment
                </button>
              </div>
            )}
          </div>
        </div>
      </Row>
    </>
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
          <Col>
            <SiteLink
              href={
                props.contractPath ? props.contractPath : contractPath(contract)
              }
              onClick={() => trackClick(contract.id)}
              className="text-lg text-indigo-700 sm:text-xl"
            >
              {question}
            </SiteLink>
          </Col>
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

function canCommentOnBet(
  userId: string,
  createdTime: number,
  user?: User | null
) {
  const isSelf = user?.id === userId
  // You can comment if your bet was posted in the last hour
  return isSelf && Date.now() - createdTime < 60 * 60 * 1000
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

function FeedAnswerGroup(props: {
  contract: FullContract<any, FreeResponse>
  answer: Answer
  items: ActivityItem[]
  type: string
}) {
  const { answer, items, contract, type } = props
  const { username, avatarUrl, name, text } = answer

  const prob = getDpmOutcomeProbability(contract.totalShares, answer.id)
  const probPercent = formatPercent(prob)
  const [open, setOpen] = useState(false)

  return (
    <Col
      className={
        type === 'answer'
          ? 'border-base-200 bg-base-200 flex-1 rounded-md p-3'
          : 'flex-1 gap-2'
      }
    >
      <Modal open={open} setOpen={setOpen}>
        <AnswerBetPanel
          answer={answer}
          contract={contract}
          closePanel={() => setOpen(false)}
          className="sm:max-w-84 !rounded-md bg-white !px-8 !py-6"
          isModal={true}
        />
      </Modal>

      <Row className="my-4 gap-3">
        <div className="px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
            <Avatar username={username} avatarUrl={avatarUrl} />
          </div>
        </div>
        <Col className="min-w-0 flex-1 gap-2">
          <div className="text-sm text-gray-500">
            <UserLink username={username} name={name} /> answered
          </div>

          <Col className="align-items justify-between gap-4 sm:flex-row">
            <span className="whitespace-pre-line text-lg">
              <Linkify text={text} />
            </span>

            <Row className="align-items justify-end gap-4">
              <span
                className={clsx(
                  'text-2xl',
                  tradingAllowed(contract) ? 'text-green-500' : 'text-gray-500'
                )}
              >
                {probPercent}
              </span>
              <BuyButton
                className={clsx(
                  'btn-sm flex-initial !px-6 sm:flex',
                  tradingAllowed(contract) ? '' : '!hidden'
                )}
                onClick={() => setOpen(true)}
              />
            </Row>
          </Col>
        </Col>
      </Row>

      {items.map((item, index) => (
        <div
          key={item.id}
          className={clsx(
            'relative ml-8',
            index !== items.length - 1 && 'pb-4'
          )}
        >
          {index !== items.length - 1 ? (
            <span
              className="absolute top-5 left-5 -ml-px h-[calc(100%-1rem)] w-0.5 bg-gray-200"
              aria-hidden="true"
            />
          ) : null}
          <div className="relative flex items-start space-x-3">
            <FeedItem item={item} />
          </div>
        </div>
      ))}
    </Col>
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
