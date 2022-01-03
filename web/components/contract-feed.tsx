// From https://tailwindui.com/components/application-ui/lists/feeds
import { Fragment, useState } from 'react'
import { ChatAltIcon, StarIcon, UserCircleIcon } from '@heroicons/react/solid'
import { useBets } from '../hooks/use-bets'
import { Bet, createComment } from '../lib/firebase/bets'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Contract } from '../lib/firebase/contracts'
import { OutcomeLabel } from './outcome-label'
import { useUser } from '../hooks/use-user'
import { User } from '../lib/firebase/users'
import { Linkify } from './linkify'
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

function FeedBet(props: { activityItem: any; user: User | null }) {
  const { activityItem, user } = props
  const { id, contractId, amount, outcome, createdTime } = activityItem
  const isCreator = user?.id == activityItem.userId

  const [comment, setComment] = useState('')
  async function submitComment() {
    if (!user) return
    await createComment(contractId, id, comment, user)
  }
  return (
    <>
      <div>
        <div className="relative px-1">
          <div className="h-8 w-8 bg-gray-200 rounded-full ring-8 ring-gray-50 flex items-center justify-center">
            <UserCircleIcon
              className="h-5 w-5 text-gray-500"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-sm text-gray-500">
          <span className="text-gray-900">{isCreator ? 'You' : 'Someone'}</span>{' '}
          placed M$ {amount} on <OutcomeLabel outcome={outcome} />{' '}
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
                className="btn btn-primary btn-outline btn-sm mt-1"
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

function FeedStart(props: { contract: Contract }) {
  const { contract } = props
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
        <div className="mt-2 text-gray-700">
          <p className="whitespace-pre-wrap">
            <Linkify text={contract.description} />
            {/* TODO: Allow creator to update the description */}
          </p>
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

function toComment(bet: Bet) {
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
    text: bet.comment!.text,
    person: {
      href: `/${bet.comment!.userUsername}`,
      name: bet.comment!.userName,
      avatarUrl: bet.comment!.userAvatarUrl,
    },
  }
}

function toActivityItem(bet: Bet) {
  return bet.comment ? toComment(bet) : toFeedBet(bet)
}

export function ContractFeed(props: { contract: Contract }) {
  const { contract } = props
  const { id } = contract
  const user = useUser()

  let bets = useBets(id)
  if (bets === 'loading') bets = []

  const allItems = [{ type: 'start', id: 0 }, ...bets.map(toActivityItem)]

  // Missing feed items:
  // - Aggegated bets (e.g. daily)
  // - Bet sale
  // - Market closed
  // - Market resolved

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
                  <FeedBet activityItem={activityItem} user={user || null} />
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
