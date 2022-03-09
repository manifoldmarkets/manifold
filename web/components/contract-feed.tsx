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

import { OutcomeLabel } from './outcome-label'
import {
  contractMetrics,
  Contract,
  contractPath,
  updateContract,
  tradingAllowed,
} from '../lib/firebase/contracts'
import { useUser } from '../hooks/use-user'
import { Linkify } from './linkify'
import { Row } from './layout/row'
import { createComment, MAX_COMMENT_LENGTH } from '../lib/firebase/comments'
import { useComments } from '../hooks/use-comments'
import { formatMoney } from '../../common/util/format'
import { ResolutionOrChance } from './contract-card'
import { SiteLink } from './site-link'
import { Col } from './layout/col'
import { UserLink } from './user-page'
import { DateTimeTooltip } from './datetime-tooltip'
import { useBets } from '../hooks/use-bets'
import { Bet } from '../lib/firebase/bets'
import { Comment, mapCommentsByBetId } from '../lib/firebase/comments'
import { JoinSpans } from './join-spans'
import { fromNow } from '../lib/util/time'
import BetRow from './bet-row'
import { parseTags } from '../../common/util/parse'
import { Avatar } from './avatar'
import { useAdmin } from '../hooks/use-admin'

function FeedComment(props: {
  activityItem: any
  moreHref: string
  feedType: FeedType
}) {
  const { activityItem, moreHref, feedType } = props
  const { person, text, amount, outcome, createdTime } = activityItem

  const bought = amount >= 0 ? 'bought' : 'sold'
  const money = formatMoney(Math.abs(amount))

  return (
    <>
      <Avatar username={person.username} avatarUrl={person.avatarUrl} />
      <div className="min-w-0 flex-1">
        <div>
          <p className="mt-0.5 text-sm text-gray-500">
            <UserLink
              className="text-gray-500"
              username={person.username}
              name={person.name}
            />{' '}
            {bought} {money}
            <MaybeOutcomeLabel outcome={outcome} feedType={feedType} />
            <Timestamp time={createdTime} />
          </p>
        </div>
        <TruncatedComment
          comment={text}
          moreHref={moreHref}
          shouldTruncate={feedType == 'activity'}
        />
      </div>
    </>
  )
}

function Timestamp(props: { time: number }) {
  const { time } = props
  return (
    <DateTimeTooltip time={time}>
      <span className="ml-1 whitespace-nowrap text-gray-400">
        {fromNow(time)}
      </span>
    </DateTimeTooltip>
  )
}

function FeedBet(props: { activityItem: any; feedType: FeedType }) {
  const { activityItem, feedType } = props
  const { id, contractId, amount, outcome, createdTime, contract } =
    activityItem
  const user = useUser()
  const isSelf = user?.id == activityItem.userId
  const isCreator = contract.creatorId == activityItem.userId
  // You can comment if your bet was posted in the last hour
  const canComment = isSelf && Date.now() - createdTime < 60 * 60 * 1000

  const [comment, setComment] = useState('')
  async function submitComment() {
    if (!user || !comment) return
    await createComment(contractId, id, comment, user)
  }

  const bought = amount >= 0 ? 'bought' : 'sold'
  const money = formatMoney(Math.abs(amount))

  return (
    <>
      <div>
        {isSelf ? (
          <Avatar avatarUrl={user?.avatarUrl} />
        ) : isCreator ? (
          <Avatar avatarUrl={contract.creatorAvatarUrl} />
        ) : (
          <div className="relative px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
              <UserIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
            </div>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500">
          <span>
            {isSelf ? 'You' : isCreator ? contract.creatorName : 'A trader'}
          </span>{' '}
          {bought} {money}
          <MaybeOutcomeLabel outcome={outcome} feedType={feedType} />
          <Timestamp time={createdTime} />
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

function FeedQuestion(props: {
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
        <Timestamp time={contract.closeTime || 0} />
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
          created this market <Timestamp time={contract.createdTime} />
        </div>
        <ContractDescription contract={contract} isCreator={isCreator} />
      </div>
    </>
  )
}

function FeedAnswer(props: { contract: Contract; outcome: string }) {
  const { contract, outcome } = props
  const answer = contract?.answers?.[Number(outcome) - 1]
  if (!answer) return null

  return (
    <>
      <Avatar username={answer.username} avatarUrl={answer.avatarUrl} />
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500">
          <UserLink
            className="text-gray-900"
            name={answer.name}
            username={answer.username}
          />{' '}
          submitted answer <OutcomeLabel outcome={outcome} />{' '}
          <Timestamp time={contract.createdTime} />
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
          <Timestamp time={contract.resolutionTime || 0} />
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
          <Timestamp time={contract.closeTime || 0} />
        </div>
      </div>
    </>
  )
}

function toFeedBet(bet: Bet, contract: Contract) {
  return {
    id: bet.id,
    contractId: bet.contractId,
    userId: bet.userId,
    type: 'bet',
    amount: bet.sale ? -bet.sale.amount : bet.amount,
    outcome: bet.outcome,
    createdTime: bet.createdTime,
    date: fromNow(bet.createdTime),
    contract,
  }
}

function toFeedComment(bet: Bet, comment: Comment) {
  return {
    id: bet.id,
    contractId: bet.contractId,
    userId: bet.userId,
    type: 'comment',
    amount: bet.sale ? -bet.sale.amount : bet.amount,
    outcome: bet.outcome,
    createdTime: bet.createdTime,
    date: fromNow(bet.createdTime),

    // Invariant: bet.comment exists
    text: comment.text,
    person: {
      username: comment.userUsername,
      name: comment.userName,
      avatarUrl: comment.userAvatarUrl,
    },
  }
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

// Group together bets that are:
// - Within `windowMs` of the first in the group
// - Do not have a comment
// - Were not created by this user or the contract creator
// Return a list of ActivityItems
function groupBets(
  bets: Bet[],
  comments: Comment[],
  windowMs: number,
  contract: Contract,
  userId?: string
) {
  const commentsMap = mapCommentsByBetId(comments)
  const items: any[] = []
  let group: Bet[] = []

  // Turn the current group into an ActivityItem
  function pushGroup() {
    if (group.length == 1) {
      items.push(toActivityItem(group[0], false))
    } else if (group.length > 1) {
      items.push({ type: 'betgroup', bets: [...group], id: group[0].id })
    }
    group = []
  }

  function toActivityItem(bet: Bet, isPublic: boolean) {
    const comment = commentsMap[bet.id]
    return comment ? toFeedComment(bet, comment) : toFeedBet(bet, contract)
  }

  for (const bet of bets) {
    const isCreator = userId === bet.userId || contract.creatorId === bet.userId

    if (commentsMap[bet.id] || isCreator) {
      pushGroup()
      // Create a single item for this
      items.push(toActivityItem(bet, true))
    } else {
      if (
        group.length > 0 &&
        bet.createdTime - group[0].createdTime > windowMs
      ) {
        // More than `windowMs` has passed; start a new group
        pushGroup()
      }
      group.push(bet)
    }
  }
  if (group.length > 0) {
    pushGroup()
  }
  return items as ActivityItem[]
}

function BetGroupSpan(props: {
  bets: Bet[]
  outcome: string
  feedType: FeedType
}) {
  const { bets, outcome, feedType } = props

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
      <MaybeOutcomeLabel outcome={outcome} feedType={feedType} />{' '}
    </span>
  )
}

// TODO: Make this expandable to show all grouped bets?
function FeedBetGroup(props: { activityItem: any; feedType: FeedType }) {
  const { activityItem, feedType } = props
  const bets: Bet[] = activityItem.bets

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
      <div className="min-w-0 flex-1">
        <div className="text-sm text-gray-500">
          {outcomes.map((outcome, index) => (
            <Fragment key={outcome}>
              <BetGroupSpan
                outcome={outcome}
                bets={betGroups[outcome]}
                feedType={feedType}
              />
              {index !== outcomes.length - 1 && <br />}
            </Fragment>
          ))}
          <Timestamp time={createdTime} />
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

// On 'multi' feeds, the outcome is redundant, so we hide it
function MaybeOutcomeLabel(props: { outcome: string; feedType: FeedType }) {
  const { outcome, feedType } = props
  return feedType === 'multi' ? null : (
    <span>
      {' '}
      of <OutcomeLabel outcome={outcome} />
      {/* TODO: Link to the correct e.g. #23 */}
    </span>
  )
}

// Missing feed items:
// - Bet sold?
type ActivityItem = {
  id: string
  type:
    | 'bet'
    | 'comment'
    | 'start'
    | 'betgroup'
    | 'close'
    | 'resolve'
    | 'expand'
    | undefined
}

type FeedType =
  // Main homepage/fold feed,
  | 'activity'
  // Comments feed on a market
  | 'market'
  // Grouped for a multi-category outcome
  | 'multi'

function FeedItems(props: {
  contract: Contract
  items: ActivityItem[]
  feedType: FeedType
  setExpanded: (expanded: boolean) => void
  outcome?: string // Which multi-category outcome to filter
  betRowClassName?: string
}) {
  const { contract, items, feedType, outcome, setExpanded, betRowClassName } =
    props
  const { outcomeType } = contract
  const isBinary = outcomeType === 'BINARY'

  return (
    <div className="flow-root pr-2 md:pr-0">
      <div className={clsx(tradingAllowed(contract) ? '' : '-mb-6')}>
        {items.map((activityItem, activityItemIdx) => (
          <div key={activityItem.id} className="relative pb-6">
            {activityItemIdx !== items.length - 1 ? (
              <span
                className="absolute top-5 left-5 -ml-px h-[calc(100%-2rem)] w-0.5 bg-gray-200"
                aria-hidden="true"
              />
            ) : null}
            <div className="relative flex items-start space-x-3">
              {activityItem.type === 'start' ? (
                feedType === 'activity' ? (
                  <FeedQuestion contract={contract} />
                ) : feedType === 'market' ? (
                  <FeedDescription contract={contract} />
                ) : feedType === 'multi' ? (
                  <FeedAnswer contract={contract} outcome={outcome || '0'} />
                ) : null
              ) : activityItem.type === 'comment' ? (
                <FeedComment
                  activityItem={activityItem}
                  moreHref={contractPath(contract)}
                  feedType={feedType}
                />
              ) : activityItem.type === 'bet' ? (
                <FeedBet activityItem={activityItem} feedType={feedType} />
              ) : activityItem.type === 'betgroup' ? (
                <FeedBetGroup activityItem={activityItem} feedType={feedType} />
              ) : activityItem.type === 'close' ? (
                <FeedClose contract={contract} />
              ) : activityItem.type === 'resolve' ? (
                <FeedResolve contract={contract} />
              ) : activityItem.type === 'expand' ? (
                <FeedExpand setExpanded={setExpanded} />
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {isBinary && tradingAllowed(contract) && (
        <BetRow contract={contract} className={clsx('mb-2', betRowClassName)} />
      )}
    </div>
  )
}

export function ContractFeed(props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  feedType: FeedType
  outcome?: string // Which multi-category outcome to filter
  betRowClassName?: string
}) {
  const { contract, feedType, outcome, betRowClassName } = props
  const { id, outcomeType } = contract
  const isBinary = outcomeType === 'BINARY'

  const [expanded, setExpanded] = useState(false)
  const user = useUser()

  let bets = useBets(contract.id) ?? props.bets
  bets = isBinary
    ? bets.filter((bet) => !bet.isAnte)
    : bets.filter((bet) => !(bet.isAnte && (bet.outcome as string) === '0'))

  if (feedType === 'multi') {
    bets = bets.filter((bet) => bet.outcome === outcome)
  }

  const comments = useComments(id) ?? props.comments

  const groupWindow = feedType == 'activity' ? 10 * DAY_IN_MS : DAY_IN_MS

  const allItems: ActivityItem[] = [
    { type: 'start', id: '0' },
    ...groupBets(bets, comments, groupWindow, contract, user?.id),
  ]
  if (contract.closeTime && contract.closeTime <= Date.now()) {
    allItems.push({ type: 'close', id: `${contract.closeTime}` })
  }
  if (contract.resolution) {
    allItems.push({ type: 'resolve', id: `${contract.resolutionTime}` })
  }
  if (feedType === 'multi') {
    // Hack to add some more padding above the 'multi' feedType, by adding a null item
    allItems.unshift({ type: undefined, id: '-1' })
  }

  // If there are more than 5 items, only show the first, an expand item, and last 3
  let items = allItems
  if (!expanded && allItems.length > 5 && feedType == 'activity') {
    items = [
      allItems[0],
      { type: 'expand', id: 'expand' },
      ...allItems.slice(-3),
    ]
  }

  return (
    <FeedItems
      contract={contract}
      items={items}
      feedType={feedType}
      setExpanded={setExpanded}
      betRowClassName={betRowClassName}
      outcome={outcome}
    />
  )
}

export function ContractActivityFeed(props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  betRowClassName?: string
}) {
  const { contract, betRowClassName, bets, comments } = props

  const user = useUser()

  bets.sort((b1, b2) => b1.createdTime - b2.createdTime)
  comments.sort((c1, c2) => c1.createdTime - c2.createdTime)

  const allItems: ActivityItem[] = [
    { type: 'start', id: '0' },
    ...groupBets(bets, comments, DAY_IN_MS, contract, user?.id),
  ]
  if (contract.closeTime && contract.closeTime <= Date.now()) {
    allItems.push({ type: 'close', id: `${contract.closeTime}` })
  }
  if (contract.resolution) {
    allItems.push({ type: 'resolve', id: `${contract.resolutionTime}` })
  }

  // Remove all but last bet group.
  const betGroups = allItems.filter((item) => item.type === 'betgroup')
  const lastBetGroup = betGroups[betGroups.length - 1]
  const filtered = allItems.filter(
    (item) => item.type !== 'betgroup' || item.id === lastBetGroup?.id
  )

  // Only show the first item plus the last three items.
  const items =
    filtered.length > 3 ? [filtered[0], ...filtered.slice(-3)] : filtered

  return (
    <FeedItems
      contract={contract}
      items={items}
      feedType="activity"
      setExpanded={() => {}}
      betRowClassName={betRowClassName}
    />
  )
}

export function ContractSummaryFeed(props: {
  contract: Contract
  betRowClassName?: string
}) {
  const { contract, betRowClassName } = props
  const { outcomeType } = contract
  const isBinary = outcomeType === 'BINARY'

  return (
    <div className="flow-root pr-2 md:pr-0">
      <div className={clsx(tradingAllowed(contract) ? '' : '-mb-8')}>
        <div className="relative pb-8">
          <div className="relative flex items-start space-x-3">
            <FeedQuestion contract={contract} showDescription />
          </div>
        </div>
      </div>
      {isBinary && tradingAllowed(contract) && (
        <BetRow contract={contract} className={clsx('mb-2', betRowClassName)} />
      )}
    </div>
  )
}
