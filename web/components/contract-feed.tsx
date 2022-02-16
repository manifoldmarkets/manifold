// From https://tailwindui.com/components/application-ui/lists/feeds
import { useState } from 'react'
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
  getBinaryProbPercent,
} from '../lib/firebase/contracts'
import { useUser } from '../hooks/use-user'
import { Linkify } from './linkify'
import { Row } from './layout/row'
import { createComment } from '../lib/firebase/comments'
import { useComments } from '../hooks/use-comments'
import { formatMoney } from '../../common/util/format'
import { ResolutionOrChance } from './contract-card'
import { SiteLink } from './site-link'
import { Col } from './layout/col'
import { UserLink } from './user-page'
import { DateTimeTooltip } from './datetime-tooltip'
import { useBetsWithoutAntes } from '../hooks/use-bets'
import { Bet } from '../lib/firebase/bets'
import { Comment, mapCommentsByBetId } from '../lib/firebase/comments'
import { JoinSpans } from './join-spans'
import { outcome } from '../../common/contract'
import { fromNow } from '../lib/util/time'
import BetRow from './bet-row'
import { parseTags } from '../../common/util/parse'
import { Avatar } from './avatar'
import { useAdmin } from '../hooks/use-admin'

function FeedComment(props: {
  activityItem: any
  moreHref: string
  feedType: 'activity' | 'market'
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
            {bought} {money} of <OutcomeLabel outcome={outcome} />{' '}
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

function FeedBet(props: { activityItem: any }) {
  const { activityItem } = props
  const { id, contractId, amount, outcome, createdTime } = activityItem
  const user = useUser()
  const isSelf = user?.id == activityItem.userId
  // The creator can comment if the bet was posted in the last hour
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
          <span>{isSelf ? 'You' : 'A trader'}</span> {bought} {money} of{' '}
          <OutcomeLabel outcome={outcome} /> <Timestamp time={createdTime} />
          {canComment && (
            // Allow user to comment in an textarea if they are the creator
            <div className="mt-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="textarea textarea-bordered w-full"
                placeholder="Add a comment..."
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
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
          if (e.key === 'Enter' && e.ctrlKey) {
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
    <div className="mt-2 whitespace-pre-line break-words text-gray-700">
      <Linkify text={truncated} />
      {truncated != comment && (
        <SiteLink href={moreHref} className="text-indigo-700">
          ... (show more)
        </SiteLink>
      )}
    </div>
  )
}

function FeedQuestion(props: { contract: Contract }) {
  const { contract } = props
  const { creatorName, creatorUsername, question, resolution, outcomeType } =
    contract
  const { truePool } = contractMetrics(contract)
  const isBinary = outcomeType === 'BINARY'

  // Currently hidden on mobile; ideally we'd fit this in somewhere.
  const closeMessage =
    contract.isResolved || !contract.closeTime ? null : (
      <span className="float-right hidden text-gray-400 sm:inline">
        {formatMoney(truePool)} pool
        <span className="mx-2">•</span>
        {contract.closeTime > Date.now() ? 'Closes' : 'Closed'}
        <Timestamp time={contract.closeTime || 0} />
      </span>
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
          {closeMessage}
        </div>
        <Col className="mb-4 items-start justify-between gap-2 sm:flex-row sm:gap-4">
          <SiteLink
            href={contractPath(contract)}
            className="text-lg text-indigo-700 sm:text-xl"
          >
            {question}
          </SiteLink>
          {(isBinary || resolution) && (
            <ResolutionOrChance
              className="items-center"
              resolution={resolution}
              probPercent={getBinaryProbPercent(contract)}
            />
          )}
        </Col>
        <TruncatedComment
          comment={contract.description}
          moreHref={contractPath(contract)}
          shouldTruncate
        />
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

function OutcomeIcon(props: { outcome?: outcome }) {
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

function toFeedBet(bet: Bet) {
  return {
    id: bet.id,
    contractId: bet.contractId,
    userId: bet.userId,
    type: 'bet',
    amount: bet.sale ? -bet.sale.amount : bet.amount,
    outcome: bet.outcome,
    createdTime: bet.createdTime,
    date: fromNow(bet.createdTime),
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
// - Were not created by this user
// Return a list of ActivityItems
function groupBets(
  bets: Bet[],
  comments: Comment[],
  windowMs: number,
  userId?: string
) {
  const commentsMap = mapCommentsByBetId(comments)
  const items: any[] = []
  let group: Bet[] = []

  // Turn the current group into an ActivityItem
  function pushGroup() {
    if (group.length == 1) {
      items.push(toActivityItem(group[0]))
    } else if (group.length > 1) {
      items.push({ type: 'betgroup', bets: [...group], id: group[0].id })
    }
    group = []
  }

  function toActivityItem(bet: Bet) {
    const comment = commentsMap[bet.id]
    return comment ? toFeedComment(bet, comment) : toFeedBet(bet)
  }

  for (const bet of bets) {
    const isCreator = userId === bet.userId

    if (commentsMap[bet.id] || isCreator) {
      pushGroup()
      // Create a single item for this
      items.push(toActivityItem(bet))
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

function BetGroupSpan(props: { bets: Bet[]; outcome: 'YES' | 'NO' }) {
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
      of <OutcomeLabel outcome={outcome} />
    </span>
  )
}

// TODO: Make this expandable to show all grouped bets?
function FeedBetGroup(props: { activityItem: any }) {
  const { activityItem } = props
  const bets: Bet[] = activityItem.bets

  const [yesBets, noBets] = _.partition(bets, (bet) => bet.outcome === 'YES')

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
          {yesBets.length > 0 && <BetGroupSpan outcome="YES" bets={yesBets} />}
          {yesBets.length > 0 && noBets.length > 0 && <br />}
          {noBets.length > 0 && <BetGroupSpan outcome="NO" bets={noBets} />}
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
}

export function ContractFeed(props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  // Feed types: 'activity' = Activity feed, 'market' = Comments feed on a market
  feedType: 'activity' | 'market'
  betRowClassName?: string
}) {
  const { contract, feedType, betRowClassName } = props
  const { id, outcomeType } = contract
  const isBinary = outcomeType === 'BINARY'

  const [expanded, setExpanded] = useState(false)
  const user = useUser()

  const bets = useBetsWithoutAntes(contract, props.bets) ?? []

  const comments = useComments(id) ?? props.comments

  const groupWindow = feedType == 'activity' ? 10 * DAY_IN_MS : DAY_IN_MS

  const allItems = [
    { type: 'start', id: 0 },
    ...groupBets(bets, comments, groupWindow, user?.id),
  ]
  if (contract.closeTime && contract.closeTime <= Date.now()) {
    allItems.push({ type: 'close', id: `${contract.closeTime}` })
  }
  if (contract.resolution) {
    allItems.push({ type: 'resolve', id: `${contract.resolutionTime}` })
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
    <div className="flow-root pr-2 md:pr-0">
      <ul role="list" className={clsx(tradingAllowed(contract) ? '' : '-mb-8')}>
        {items.map((activityItem, activityItemIdx) => (
          <li key={activityItem.id}>
            <div className="relative pb-8">
              {activityItemIdx !== items.length - 1 ? (
                <span
                  className="absolute top-5 left-5 -ml-px h-[calc(100%-2rem)] w-0.5 bg-gray-200"
                  aria-hidden="true"
                />
              ) : null}
              <div className="relative flex items-start space-x-3">
                {activityItem.type === 'start' ? (
                  feedType == 'activity' ? (
                    <FeedQuestion contract={contract} />
                  ) : (
                    <FeedDescription contract={contract} />
                  )
                ) : activityItem.type === 'comment' ? (
                  <FeedComment
                    activityItem={activityItem}
                    moreHref={contractPath(contract)}
                    feedType={feedType}
                  />
                ) : activityItem.type === 'bet' ? (
                  <FeedBet activityItem={activityItem} />
                ) : activityItem.type === 'betgroup' ? (
                  <FeedBetGroup activityItem={activityItem} />
                ) : activityItem.type === 'close' ? (
                  <FeedClose contract={contract} />
                ) : activityItem.type === 'resolve' ? (
                  <FeedResolve contract={contract} />
                ) : activityItem.type === 'expand' ? (
                  <FeedExpand setExpanded={setExpanded} />
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {isBinary && tradingAllowed(contract) && (
        <BetRow contract={contract} className={clsx('mb-2', betRowClassName)} />
      )}
    </div>
  )
}
