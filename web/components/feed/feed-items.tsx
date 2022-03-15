// From https://tailwindui.com/components/application-ui/lists/feeds
import { Fragment, useState } from 'react'
import _ from 'lodash'
import {
  BanIcon,
  CheckIcon,
  DotsVerticalIcon,
  LockClosedIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from '@heroicons/react/solid'
import dayjs from 'dayjs'
import clsx from 'clsx'
import Textarea from 'react-expanding-textarea'

import { OutcomeLabel } from '../outcome-label'
import {
  contractMetrics,
  Contract,
  contractPath,
  updateContract,
  tradingAllowed,
} from '../../lib/firebase/contracts'
import { useUser } from '../../hooks/use-user'
import { Linkify } from '../linkify'
import { Row } from '../layout/row'
import {
  canAddComment,
  createComment,
  MAX_COMMENT_LENGTH,
} from '../../lib/firebase/comments'
import { formatMoney } from '../../../common/util/format'
import { Comment } from '../../../common/comment'
import { ResolutionOrChance } from '../contract-card'
import { SiteLink } from '../site-link'
import { Col } from '../layout/col'
import { UserLink } from '../user-page'
import { DateTimeTooltip } from '../datetime-tooltip'
import { Bet } from '../../lib/firebase/bets'
import { JoinSpans } from '../join-spans'
import { fromNow } from '../../lib/util/time'
import BetRow from '../bet-row'
import { parseTags } from '../../../common/util/parse'
import { Avatar } from '../avatar'
import { useAdmin } from '../../hooks/use-admin'
import { Answer } from '../../../common/answer'
import { ActivityItem } from './activity-items'

export function FeedItems(props: {
  contract: Contract
  items: ActivityItem[]
  betRowClassName?: string
}) {
  const { contract, items, betRowClassName } = props
  const { outcomeType } = contract

  return (
    <div className="flow-root pr-2 md:pr-0">
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
    case 'createanswer':
      return <FeedCreateAnswer {...item} />
    case 'betgroup':
      return <FeedBetGroup {...item} />
    case 'answergroup':
      return <FeedAnswerGroup {...item} />
    case 'close':
      return <FeedClose {...item} />
    case 'resolve':
      return <FeedResolve {...item} />
  }
}

function FeedComment(props: {
  contract: Contract
  comment: Comment
  bet: Bet
  hideOutcome: boolean
  truncate: boolean
  smallAvatar: boolean
}) {
  const { contract, comment, bet, hideOutcome, truncate, smallAvatar } = props
  const { amount, outcome } = bet
  const { text, userUsername, userName, userAvatarUrl, createdTime } = comment

  const bought = amount >= 0 ? 'bought' : 'sold'
  const money = formatMoney(Math.abs(amount))

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
                of <OutcomeLabel outcome={outcome} />
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

function FeedBet(props: {
  contract: Contract
  bet: Bet
  hideOutcome: boolean
  smallAvatar: boolean
}) {
  const { contract, bet, hideOutcome, smallAvatar } = props
  const { id, amount, outcome, createdTime, userId } = bet
  const user = useUser()
  const isSelf = user?.id === userId
  const isCreator = contract.creatorId === userId

  // You can comment if your bet was posted in the last hour
  const canComment = canAddComment(createdTime, isSelf)

  const [comment, setComment] = useState('')
  async function submitComment() {
    if (!user || !comment) return
    await createComment(contract.id, id, comment, user)
  }

  const bought = amount >= 0 ? 'bought' : 'sold'
  const money = formatMoney(Math.abs(amount))

  const answer =
    !hideOutcome &&
    (contract.answers?.find((answer: Answer) => answer?.id === outcome) as
      | Answer
      | undefined)

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
        ) : isCreator ? (
          <Avatar
            className={clsx(smallAvatar && 'ml-1')}
            size={smallAvatar ? 'sm' : undefined}
            avatarUrl={contract.creatorAvatarUrl}
            username={contract.creatorUsername}
          />
        ) : (
          <div className="relative px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
              <UserIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
            </div>
          </div>
        )}
      </div>
      <div className={clsx('min-w-0 flex-1 pb-1.5', !answer && 'pt-1.5')}>
        {answer && (
          <div className="text-neutral mb-2" style={{ fontSize: 15 }}>
            <Linkify text={answer.text} />
          </div>
        )}
        <div className="text-sm text-gray-500">
          <span>
            {isSelf ? 'You' : isCreator ? contract.creatorName : 'A trader'}
          </span>{' '}
          {bought} {money}
          {!answer && !hideOutcome && (
            <>
              {' '}
              of <OutcomeLabel outcome={outcome} />
            </>
          )}
          <RelativeTimestamp time={createdTime} />
          {canComment && (
            // Allow user to comment in an textarea if they are the creator
            <div className="mt-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="textarea textarea-bordered w-full"
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
          )}
        </div>
      </div>
    </>
  )
}

function EditContract(props: {
  text: string
  onSave: (newText: string) => void
  buttonText: string
}) {
  const [text, setText] = useState(props.text)
  const [editing, setEditing] = useState(false)
  const onSave = (newText: string) => {
    setEditing(false)
    setText(props.text) // Reset to original text
    props.onSave(newText)
  }

  return editing ? (
    <div className="mt-4">
      <Textarea
        className="textarea textarea-bordered mb-1 h-24 w-full"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value || '')}
        autoFocus
        onFocus={(e) =>
          // Focus starts at end of text.
          e.target.setSelectionRange(text.length, text.length)
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            onSave(text)
          }
        }}
      />
      <Row className="gap-2">
        <button
          className="btn btn-neutral btn-outline btn-sm"
          onClick={() => onSave(text)}
        >
          Save
        </button>
        <button
          className="btn btn-error btn-outline btn-sm"
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </Row>
    </div>
  ) : (
    <Row>
      <button
        className="btn btn-neutral btn-outline btn-xs mt-4"
        onClick={() => setEditing(true)}
      >
        {props.buttonText}
      </button>
    </Row>
  )
}

export function ContractDescription(props: {
  contract: Contract
  isCreator: boolean
}) {
  const { contract, isCreator } = props
  const descriptionTimestamp = () => `${dayjs().format('MMM D, h:mma')}: `
  const isAdmin = useAdmin()

  // Append the new description (after a newline)
  async function saveDescription(newText: string) {
    const newDescription = `${contract.description}\n\n${newText}`.trim()
    const tags = parseTags(
      `${newDescription} ${contract.tags.map((tag) => `#${tag}`).join(' ')}`
    )
    const lowercaseTags = tags.map((tag) => tag.toLowerCase())
    await updateContract(contract.id, {
      description: newDescription,
      tags,
      lowercaseTags,
    })
  }

  if (!isCreator && !contract.description.trim()) return null

  return (
    <div className="mt-2 whitespace-pre-line break-words text-gray-700">
      <Linkify text={contract.description} />
      <br />
      {isCreator && (
        <EditContract
          // Note: Because descriptionTimestamp is called once, later edits use
          // a stale timestamp. Ideally this is a function that gets called when
          // isEditing is set to true.
          text={descriptionTimestamp()}
          onSave={saveDescription}
          buttonText="Add to description"
        />
      )}
      {isAdmin && (
        <EditContract
          text={contract.question}
          onSave={(question) => updateContract(contract.id, { question })}
          buttonText="ADMIN: Edit question"
        />
      )}
      {/* {isAdmin && (
        <EditContract
          text={contract.createdTime.toString()}
          onSave={(time) =>
            updateContract(contract.id, { createdTime: Number(time) })
          }
          buttonText="ADMIN: Edit createdTime"
        />
      )} */}
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
  showDescription?: boolean
}) {
  const { contract, showDescription } = props
  const { creatorName, creatorUsername, question, resolution, outcomeType } =
    contract
  const { truePool } = contractMetrics(contract)
  const isBinary = outcomeType === 'BINARY'

  const closeMessage =
    contract.isResolved || !contract.closeTime ? null : (
      <>
        <span className="mx-2">•</span>
        {contract.closeTime > Date.now() ? 'Closes' : 'Closed'}
        <RelativeTimestamp time={contract.closeTime || 0} />
      </>
    )

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
            {formatMoney(truePool)} pool
            {closeMessage}
          </span>
        </div>
        <Col className="items-start justify-between gap-2 sm:flex-row sm:gap-4">
          <Col>
            <SiteLink
              href={contractPath(contract)}
              className="text-lg text-indigo-700 sm:text-xl"
            >
              {question}
            </SiteLink>
            {!showDescription && (
              <SiteLink
                href={contractPath(contract)}
                className="relative top-4 self-end text-sm sm:self-start"
              >
                <div className="pb-1.5 text-gray-500">See more...</div>
              </SiteLink>
            )}
          </Col>
          {(isBinary || resolution) && (
            <ResolutionOrChance className="items-center" contract={contract} />
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
        <ContractDescription contract={contract} isCreator={isCreator} />
      </div>
    </>
  )
}

function FeedCreateAnswer(props: { contract: Contract; answer: Answer }) {
  const { answer } = props

  return (
    <>
      <Avatar
        className="ml-1"
        size="sm"
        username={answer.username}
        avatarUrl={answer.avatarUrl}
      />
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500">
          <UserLink
            className="text-gray-900"
            name={answer.name}
            username={answer.username}
          />{' '}
          submitted this answer <RelativeTimestamp time={answer.createdTime} />
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
          resolved this market to <OutcomeLabel outcome={resolution} />{' '}
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

function BetGroupSpan(props: { bets: Bet[]; outcome?: string }) {
  const { bets, outcome } = props

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
          of <OutcomeLabel outcome={outcome} />
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
  const { bets, hideOutcome } = props

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
  contract: Contract
  answer: Answer
  items: ActivityItem[]
}) {
  const { answer, items } = props
  const { username, avatarUrl, userId, name, text } = answer

  return (
    <Col className="flex-1 gap-2">
      <Row className="mb-4 gap-3">
        <div className="px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
            <Avatar username={username} avatarUrl={avatarUrl} />
          </div>
        </div>
        <Col className="min-w-0 flex-1 gap-2">
          <div className="text-sm text-gray-500">
            <UserLink username={username} name={name} /> answered
          </div>
          <Linkify text={text} />
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
