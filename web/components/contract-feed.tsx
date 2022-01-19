// From https://tailwindui.com/components/application-ui/lists/feeds
import { ReactChild, useState } from 'react'
import _ from 'lodash'
import {
  BanIcon,
  ChatAltIcon,
  CheckIcon,
  LockClosedIcon,
  StarIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from '@heroicons/react/solid'

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(relativeTime)

import { OutcomeLabel } from './outcome-label'
import {
  contractMetrics,
  Contract,
  contractPath,
  updateContract,
} from '../lib/firebase/contracts'
import { useUser } from '../hooks/use-user'
import { Linkify } from './linkify'
import { Row } from './layout/row'
import { createComment } from '../lib/firebase/comments'
import { useComments } from '../hooks/use-comments'
import { formatMoney } from '../lib/util/format'
import { ResolutionOrChance } from './contract-card'
import { SiteLink } from './site-link'
import { Col } from './layout/col'
import { UserLink } from './user-page'
import { DateTimeTooltip } from './datetime-tooltip'
import { useBets } from '../hooks/use-bets'
import { Bet, withoutAnteBets } from '../lib/firebase/bets'
import { Comment, mapCommentsByBetId } from '../lib/firebase/comments'
import { JoinSpans } from './join-spans'
import Textarea from 'react-expanding-textarea'

function AvatarWithIcon(props: { username: string; avatarUrl: string }) {
  const { username, avatarUrl } = props
  return (
    <SiteLink className="relative" href={`/${username}`}>
      <img
        className="h-10 w-10 rounded-full bg-gray-400 flex items-center justify-center"
        src={avatarUrl}
        alt=""
      />
    </SiteLink>
  )
}

function FeedComment(props: { activityItem: any }) {
  const { activityItem } = props
  const { person, text, amount, outcome, createdTime } = activityItem

  const bought = amount >= 0 ? 'bought' : 'sold'
  const money = formatMoney(Math.abs(amount))

  return (
    <>
      <AvatarWithIcon username={person.username} avatarUrl={person.avatarUrl} />
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
        <div className="mt-2 text-gray-700">
          <p className="whitespace-pre-wrap">
            <Linkify text={text} />
          </p>
        </div>
      </div>
    </>
  )
}

function Timestamp(props: { time: number }) {
  const { time } = props
  return (
    <DateTimeTooltip time={time}>
      <span className="whitespace-nowrap text-gray-400 ml-1">
        {dayjs(time).fromNow()}
      </span>
    </DateTimeTooltip>
  )
}

function FeedBet(props: { activityItem: any }) {
  const { activityItem } = props
  const { id, contractId, amount, outcome, createdTime } = activityItem
  const user = useUser()
  const isCreator = user?.id == activityItem.userId
  // The creator can comment if the bet was posted in the last hour
  const canComment = isCreator && Date.now() - createdTime < 60 * 60 * 1000

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
        <div className="relative px-1">
          <div className="h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center">
            <UserIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500">
          <span>{isCreator ? 'You' : 'A trader'}</span> {bought} {money} of{' '}
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

export function ContractDescription(props: {
  contract: Contract
  isCreator: boolean
}) {
  const { contract, isCreator } = props
  const [editing, setEditing] = useState(false)
  const editStatement = () => `${dayjs().format('MMM D, h:mma')}: `
  const [description, setDescription] = useState(editStatement())

  // Append the new description (after a newline)
  async function saveDescription(e: any) {
    e.preventDefault()
    setEditing(false)

    const newDescription = `${contract.description}\n\n${description}`.trim()
    await updateContract(contract.id, { description: newDescription })

    setDescription(editStatement())
  }

  if (!isCreator && !contract.description.trim()) return null

  return (
    <div className="whitespace-pre-line break-words mt-2 text-gray-700">
      <Linkify text={contract.description} />
      <br />
      {isCreator &&
        !contract.resolution &&
        (editing ? (
          <form className="mt-4">
            <Textarea
              className="textarea h-24 textarea-bordered w-full mb-1"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value || '')}
              autoFocus
              onFocus={(e) =>
                // Focus starts at end of description.
                e.target.setSelectionRange(
                  description.length,
                  description.length
                )
              }
            />
            <Row className="gap-2">
              <button
                className="btn btn-neutral btn-outline btn-sm"
                onClick={saveDescription}
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
          </form>
        ) : (
          <Row>
            <button
              className="btn btn-neutral btn-outline btn-sm mt-4"
              onClick={() => setEditing(true)}
            >
              Add to description
            </button>
          </Row>
        ))}
    </div>
  )
}

function FeedQuestion(props: { contract: Contract }) {
  const { contract } = props
  const { creatorName, creatorUsername, createdTime, question, resolution } =
    contract
  const { probPercent } = contractMetrics(contract)

  let description = contract.description
  // Keep descriptions to at most 400 characters
  if (description.length > 400) {
    description = description.slice(0, 400)
    // Make sure to end on a space
    const i = description.lastIndexOf(' ')
    description = description.slice(0, i)
  }

  // Currently hidden on mobile; ideally we'd fit this in somewhere.
  const closeMessage =
    contract.isResolved || !contract.closeTime ? null : (
      <span className="float-right text-gray-400 hidden sm:inline">
        {contract.closeTime > Date.now() ? 'Closes' : 'Closed'}
        <Timestamp time={contract.closeTime || 0} />
      </span>
    )

  return (
    <>
      {contract.creatorAvatarUrl ? (
        <AvatarWithIcon
          username={contract.creatorUsername}
          avatarUrl={contract.creatorAvatarUrl}
        />
      ) : (
        // TODO: After 2022-03-01, can just assume that all contracts have an avatarUrl
        <div className="relative px-1">
          <div className="h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center">
            <StarIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500 mb-2">
          <UserLink
            className="text-gray-900"
            name={creatorName}
            username={creatorUsername}
          />{' '}
          asked <Timestamp time={createdTime} />
          {closeMessage}
        </div>
        <Col className="items-start sm:flex-row justify-between gap-2 sm:gap-4 mb-4">
          <SiteLink
            href={contractPath(contract)}
            className="text-lg sm:text-xl text-indigo-700"
          >
            {question}
          </SiteLink>
          <ResolutionOrChance
            className="items-center"
            resolution={resolution}
            probPercent={probPercent}
          />
        </Col>
        <div className="whitespace-pre-line break-words mt-2 text-gray-700">
          <Linkify text={description} />
          {description != contract.description && (
            <SiteLink href={contractPath(contract)} className="text-indigo-700">
              ... (show more)
            </SiteLink>
          )}
        </div>
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
      <div>
        <div className="relative px-1">
          <div className="h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center">
            <StarIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
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
          created this market <Timestamp time={contract.createdTime} />
        </div>
        <ContractDescription contract={contract} isCreator={isCreator} />
      </div>
    </>
  )
}

function OutcomeIcon(props: { outcome?: 'YES' | 'NO' | 'CANCEL' }) {
  const { outcome } = props
  switch (outcome) {
    case 'YES':
      return <CheckIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
    case 'NO':
      return <XIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
    case 'CANCEL':
    default:
      return <BanIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
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
          <div className="h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center">
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
          <div className="h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center">
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
    date: dayjs(bet.createdTime).fromNow(),
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
    date: dayjs(bet.createdTime).fromNow(),

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

  const createdTime = bets[0].createdTime

  return (
    <>
      <div>
        <div className="relative px-1">
          <div className="h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center">
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

// Missing feed items:
// - Bet sold?
type ActivityItem = {
  id: string
  type: 'bet' | 'comment' | 'start' | 'betgroup' | 'close' | 'resolve'
}

export function ContractFeed(props: {
  contract: Contract
  bets: Bet[]
  comments: Comment[]
  // Feed types: 'activity' = Activity feed, 'market' = Comments feed on a market
  feedType: 'activity' | 'market'
}) {
  const { contract, feedType } = props
  const { id } = contract
  const user = useUser()

  let bets = useBets(id) ?? props.bets
  bets = withoutAnteBets(contract, bets)

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

  return (
    <div className="flow-root">
      <ul role="list" className="-mb-8">
        {allItems.map((activityItem, activityItemIdx) => (
          <li key={activityItem.id}>
            <div className="relative pb-8">
              {activityItemIdx !== allItems.length - 1 ? (
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
                  <FeedComment activityItem={activityItem} />
                ) : activityItem.type === 'bet' ? (
                  <FeedBet activityItem={activityItem} />
                ) : activityItem.type === 'betgroup' ? (
                  <FeedBetGroup activityItem={activityItem} />
                ) : activityItem.type === 'close' ? (
                  <FeedClose contract={contract} />
                ) : activityItem.type === 'resolve' ? (
                  <FeedResolve contract={contract} />
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
