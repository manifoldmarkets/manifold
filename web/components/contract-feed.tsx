// From https://tailwindui.com/components/application-ui/lists/feeds
import { useState } from 'react'
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
import { useBets } from '../hooks/use-bets'
import { Bet } from '../lib/firebase/bets'
import { Comment, mapCommentsByBetId } from '../lib/firebase/comments'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { OutcomeLabel } from './outcome-label'
import { Contract, setContract } from '../lib/firebase/contracts'
import { useUser } from '../hooks/use-user'
import { Linkify } from './linkify'
import { Row } from './layout/row'
import { createComment } from '../lib/firebase/comments'
import { useComments } from '../hooks/use-comments'
import { formatMoney } from '../lib/util/format'
dayjs.extend(relativeTime)

function FeedComment(props: { activityItem: any }) {
  const { activityItem } = props
  const { person, text, amount, outcome, createdTime } = activityItem
  return (
    <>
      <div className="relative">
        <img
          className="h-10 w-10 rounded-full bg-gray-400 flex items-center justify-center ring-8 ring-gray-50"
          src={person.avatarUrl}
          alt=""
        />

        <span className="absolute -bottom-3 -right-2 bg-gray-50 rounded-tl px-0.5 py-px">
          <ChatAltIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div>
          <p className="mt-0.5 text-sm text-gray-500">
            <a href={person.href} className="font-medium text-gray-900">
              {person.name}
            </a>{' '}
            placed M$ {amount} on <OutcomeLabel outcome={outcome} />{' '}
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
    <span
      className="whitespace-nowrap text-gray-300"
      title={dayjs(time).format('MMM D, h:mma')}
    >
      {dayjs(time).fromNow()}
    </span>
  )
}

function FeedBet(props: { activityItem: any }) {
  const { activityItem } = props
  const { id, contractId, amount, outcome, createdTime } = activityItem
  const user = useUser()
  const isCreator = user?.id == activityItem.userId

  const [comment, setComment] = useState('')
  async function submitComment() {
    if (!user || !comment) return
    await createComment(contractId, id, comment, user)
  }
  return (
    <>
      <div>
        <div className="relative px-1">
          <div className="h-8 w-8 bg-gray-200 rounded-full ring-8 ring-gray-50 flex items-center justify-center">
            <UserIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500">
          <span className="text-gray-900">
            {isCreator ? 'You' : 'A trader'}
          </span>{' '}
          placed {formatMoney(amount)} on <OutcomeLabel outcome={outcome} />{' '}
          <Timestamp time={createdTime} />
          {isCreator && (
            // Allow user to comment in an textarea if they are the creator
            <div className="mt-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="textarea textarea-bordered w-full"
                placeholder="Add a comment..."
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
    contract.description = `${contract.description}\n${description}`.trim()
    await setContract(contract)
    setDescription(editStatement())
  }

  return (
    <div className="whitespace-pre-line break-words mt-2 text-gray-700">
      <Linkify text={contract.description} />
      <br />
      {isCreator &&
        !contract.resolution &&
        (editing ? (
          <form className="mt-4">
            <textarea
              className="textarea h-24 textarea-bordered w-full mb-1"
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

function FeedStart(props: { contract: Contract }) {
  const { contract } = props
  const user = useUser()
  const isCreator = user?.id === contract.creatorId

  return (
    <>
      <div>
        <div className="relative px-1">
          <div className="h-8 w-8 bg-gray-200 rounded-full ring-8 ring-gray-50 flex items-center justify-center">
            <StarIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500">
          <span className="text-gray-900">{contract.creatorName}</span> created
          this market <Timestamp time={contract.createdTime} />
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
  const resolution = contract.resolution || 'CANCEL'

  return (
    <>
      <div>
        <div className="relative px-1">
          <div className="h-8 w-8 bg-gray-200 rounded-full ring-8 ring-gray-50 flex items-center justify-center">
            <OutcomeIcon outcome={resolution} />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500">
          <span className="text-gray-900">{contract.creatorName}</span> resolved
          this market to <OutcomeLabel outcome={resolution} />{' '}
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
          <div className="h-8 w-8 bg-gray-200 rounded-full ring-8 ring-gray-50 flex items-center justify-center">
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
    amount: bet.amount,
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
    amount: bet.amount,
    outcome: bet.outcome,
    createdTime: bet.createdTime,
    date: dayjs(bet.createdTime).fromNow(),

    // Invariant: bet.comment exists
    text: comment.text,
    person: {
      href: `/${comment.userUsername}`,
      name: comment.userName,
      avatarUrl: comment.userAvatarUrl,
    },
  }
}

// Group together bets that are:
// - Within 24h of the first in the group
// - Do not have a comment
// - Were not created by this user
// Return a list of ActivityItems
function group(bets: Bet[], comments: Comment[], userId?: string) {
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
        dayjs(bet.createdTime).diff(dayjs(group[0].createdTime), 'hour') > 24
      ) {
        // More than 24h has passed; start a new group
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

// TODO: Make this expandable to show all grouped bets?
function FeedBetGroup(props: { activityItem: any }) {
  const { activityItem } = props
  const bets: Bet[] = activityItem.bets

  const yesAmount = bets
    .filter((b) => b.outcome == 'YES')
    .reduce((acc, bet) => acc + bet.amount, 0)
  const yesSpan = yesAmount ? (
    <span>
      {formatMoney(yesAmount)} on <OutcomeLabel outcome={'YES'} />
    </span>
  ) : null
  const noAmount = bets
    .filter((b) => b.outcome == 'NO')
    .reduce((acc, bet) => acc + bet.amount, 0)
  const noSpan = noAmount ? (
    <span>
      {formatMoney(noAmount)} on <OutcomeLabel outcome={'NO'} />
    </span>
  ) : null
  const traderCount = bets.length
  const createdTime = bets[0].createdTime

  return (
    <>
      <div>
        <div className="relative px-1">
          <div className="h-8 w-8 bg-gray-200 rounded-full ring-8 ring-gray-50 flex items-center justify-center">
            <UsersIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500">
          <span className="text-gray-900">{traderCount} traders</span> placed{' '}
          {yesSpan}
          {yesAmount && noAmount ? ' and ' : ''}
          {noSpan} <Timestamp time={createdTime} />
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

export function ContractFeed(props: { contract: Contract }) {
  const { contract } = props
  const { id } = contract
  const user = useUser()

  let bets = useBets(id)
  if (bets === 'loading') bets = []

  let comments = useComments(id)
  if (comments === 'loading') comments = []

  const allItems = [
    { type: 'start', id: 0 },
    ...group(bets, comments, user?.id),
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
                  className="absolute top-5 left-5 -ml-px h-full w-0.5 bg-gray-200"
                  aria-hidden="true"
                />
              ) : null}
              <div className="relative flex items-start space-x-3">
                {activityItem.type === 'start' ? (
                  <FeedStart contract={contract} />
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
