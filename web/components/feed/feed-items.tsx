// From https://tailwindui.com/components/application-ui/lists/feeds
import { Fragment, useRef, useState } from 'react'
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
import { FreeResponse, FullContract } from '../../../common/contract'
import { BuyButton } from '../yes-no-selector'
import { getDpmOutcomeProbability } from '../../../common/calculate-dpm'
import { AnswerBetPanel } from '../answers/answer-bet-panel'
import { useSaveSeenContract } from '../../hooks/use-seen-contracts'
import { User } from '../../../common/user'
import { Modal } from '../layout/modal'
import { trackClick } from '../../lib/firebase/tracking'

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
          <div key={item.id} className="relative pb-6">
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
  bet: Bet | undefined
  hideOutcome: boolean
  truncate: boolean
  smallAvatar: boolean
}) {
  const { contract, comment, bet, hideOutcome, truncate, smallAvatar } = props
  let money: string | undefined
  let outcome: string | undefined
  let bought: string | undefined
  if (bet) {
    outcome = bet.outcome
    bought = bet.amount >= 0 ? 'bought' : 'sold'
    money = formatMoney(Math.abs(bet.amount))
  }
  const { text, userUsername, userName, userAvatarUrl, createdTime } = comment

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
            {bought} {money}
            {!hideOutcome && (
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

function RelativeTimestamp(props: { time: number }) {
  const { time } = props
  return (
    <DateTimeTooltip time={time}>
      <span className="ml-1 whitespace-nowrap text-gray-400">
        {fromNow(time)}
      </span>
    </DateTimeTooltip>
  )
}

export function CommentInput(props: {
  contract: Contract
  comments: Comment[]
  bets: Bet[]
}) {
  // see if we can comment input on any bet:
  const { contract, bets, comments } = props
  const user = useUser()
  let canCommentOnBet = false
  bets.forEach((bet) => {
    // make sure there is not already a comment with a mathcing bet id:
    const matchingComment = comments.find((comment) => comment.betId === bet.id)
    if (matchingComment) {
      return
    }
    const { createdTime, userId } = bet
    const isSelf = user?.id === userId
    // You can comment if your bet was posted in the last hour
    const canComment = isSelf && Date.now() - createdTime < 60 * 60 * 1000
    if (canComment) {
      // if you can comment on this bet, then you can comment on the contract
      canCommentOnBet = true
    }
  })

  const [comment, setComment] = useState('')

  async function submitComment() {
    if (!user || !comment) return
    await createComment(contract.id, comment, user)
    setComment('')
  }

  if (canCommentOnBet) return <div />

  return (
    <>
      <div>
        <Avatar avatarUrl={user?.avatarUrl} username={user?.username} />
      </div>
      <div className={'min-w-0 flex-1 py-1.5'}>
        <div className="text-sm text-gray-500">
          {/*<span>{isSelf ? 'You' : bettor ? bettor.name : 'A trader'}</span>{' '}*/}

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
              className="btn btn-outline btn-sm mt-1"
              onClick={submitComment}
            >
              Comment
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export function FeedBet(props: {
  contract: Contract
  bet: Bet
  hideOutcome: boolean
  smallAvatar: boolean
  bettor?: User // If set: reveal bettor identity
}) {
  const { contract, bet, hideOutcome, smallAvatar, bettor } = props
  const { id, amount, outcome, createdTime, userId } = bet
  const user = useUser()
  const isSelf = user?.id === userId

  // You can comment if your bet was posted in the last hour
  const canComment = isSelf && Date.now() - createdTime < 60 * 60 * 1000

  const [comment, setComment] = useState('')
  async function submitComment() {
    if (!user || !comment || !canComment) return
    await createComment(contract.id, comment, user, id)
  }

  const bought = amount >= 0 ? 'bought' : 'sold'
  const money = formatMoney(Math.abs(amount))

  return (
    <>
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
              <UserIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
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
                className="btn btn-outline btn-sm mt-1"
                onClick={submitComment}
                disabled={!canComment}
              >
                Comment
              </button>
            </div>
          )}
        </div>
      </div>
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
  const { creatorName, creatorUsername, question, resolution, outcomeType } =
    contract
  const { volumeLabel } = contractMetrics(contract)
  const isBinary = outcomeType === 'BINARY'

  // const closeMessage =
  //   contract.isResolved || !contract.closeTime ? null : (
  //     <>
  //       <span className="mx-2">•</span>
  //       {contract.closeTime > Date.now() ? 'Closes' : 'Closed'}
  //       <RelativeTimestamp time={contract.closeTime || 0} />
  //     </>
  //   )

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
          <span className="float-right hidden text-gray-400 sm:inline">
            {volumeLabel}
            {/* {closeMessage} */}
          </span>
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
}) {
  const { answer, items, contract } = props
  const { username, avatarUrl, name, text } = answer

  const prob = getDpmOutcomeProbability(contract.totalShares, answer.id)
  const probPercent = formatPercent(prob)
  const [open, setOpen] = useState(false)

  return (
    <Col className="flex-1 gap-2">
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
