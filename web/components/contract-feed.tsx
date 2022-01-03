// From https://tailwindui.com/components/application-ui/lists/feeds
import { Fragment } from 'react'
import { ChatAltIcon, TagIcon, UserCircleIcon } from '@heroicons/react/solid'
import { useBets } from '../hooks/use-bets'
import { Bet } from '../lib/firebase/bets'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Contract } from '../lib/firebase/contracts'
import { OutcomeLabel } from './outcome-label'
dayjs.extend(relativeTime)

const activity = [
  {
    id: 1,
    type: 'comment',
    person: { name: 'Eduardo Benz', href: '#' },
    imageUrl:
      'https://images.unsplash.com/photo-1520785643438-5bf77931f493?ixlib=rb-=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=256&h=256&q=80',
    comment:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Tincidunt nunc ipsum tempor purus vitae id. Morbi in vestibulum nec varius. Et diam cursus quis sed purus nam. ',
    date: '6d ago',
  },
  {
    id: 'hifadsdf',
    type: 'bet',
    outcome: 'YES',
    amount: 30,
    date: '2d ago',
  },
  {
    id: 3,
    type: 'tags',
    person: { name: 'Hilary Mahy', href: '#' },
    tags: [
      { name: 'Bug', href: '#', color: 'bg-rose-500' },
      { name: 'Accessibility', href: '#', color: 'bg-indigo-500' },
    ],
    date: '6h ago',
  },
  {
    id: 4,
    type: 'comment',
    person: { name: 'Jason Meyers', href: '#' },
    imageUrl:
      'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?ixlib=rb-=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=256&h=256&q=80',
    comment:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Tincidunt nunc ipsum tempor purus vitae id. Morbi in vestibulum nec varius. Et diam cursus quis sed purus nam. Scelerisque amet elit non sit ut tincidunt condimentum. Nisl ultrices eu venenatis diam.',
    date: '2h ago',
  },
]

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

function FeedComment(props: { activityItem: any }) {
  const { activityItem } = props
  return (
    <>
      <div className="relative">
        <img
          className="h-10 w-10 rounded-full bg-gray-400 flex items-center justify-center ring-8 ring-white"
          src={activityItem.imageUrl}
          alt=""
        />

        <span className="absolute -bottom-0.5 -right-1 bg-white rounded-tl px-0.5 py-px">
          <ChatAltIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div>
          <div className="text-sm">
            <a
              href={activityItem.person.href}
              className="font-medium text-gray-900"
            >
              {activityItem.person.name}
            </a>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            Commented {activityItem.date}
          </p>
        </div>
        <div className="mt-2 text-sm text-gray-700">
          <p>{activityItem.comment}</p>
        </div>
      </div>
    </>
  )
}

function FeedBet(props: { activityItem: any }) {
  const { activityItem } = props
  const { amount, outcome, createdTime } = activityItem
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
          <span className="text-gray-900">Someone</span> placed M$ {amount} on{' '}
          <OutcomeLabel outcome={outcome} />{' '}
          <span
            className="whitespace-nowrap"
            title={dayjs(createdTime).format('MMM D, h:mma')}
          >
            {dayjs(createdTime).fromNow()}
          </span>
        </div>
      </div>
    </>
  )
}

function FeedTags(props: { activityItem: any }) {
  const { activityItem } = props
  return (
    <>
      <div>
        <div className="relative px-1">
          <div className="h-8 w-8 bg-gray-100 rounded-full ring-8 ring-white flex items-center justify-center">
            <TagIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 py-0">
        <div className="text-sm leading-8 text-gray-500">
          <span className="mr-0.5">
            <a
              href={activityItem.person.href}
              className="font-medium text-gray-900"
            >
              {activityItem.person.name}
            </a>{' '}
            added tags
          </span>{' '}
          <span className="mr-0.5">
            {activityItem.tags.map((tag) => (
              <Fragment key={tag.name}>
                <a
                  href={tag.href}
                  className="relative inline-flex items-center rounded-full border border-gray-300 px-3 py-0.5 text-sm"
                >
                  <span className="absolute flex-shrink-0 flex items-center justify-center">
                    <span
                      className={classNames(
                        tag.color,
                        'h-1.5 w-1.5 rounded-full'
                      )}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="ml-3.5 font-medium text-gray-900">
                    {tag.name}
                  </span>
                </a>{' '}
              </Fragment>
            ))}
          </span>
          <span className="whitespace-nowrap">{activityItem.date}</span>
        </div>
      </div>
    </>
  )
}

function toFeedBet(bet: Bet) {
  return {
    id: bet.id,
    userId: bet.userId,
    type: 'bet',
    amount: bet.amount,
    outcome: bet.outcome,
    createdTime: bet.createdTime,
    date: dayjs(bet.createdTime).fromNow(),
  }
}

export function ContractFeed(props: { contract: Contract }) {
  const { contract } = props
  const { id } = contract

  let bets = useBets(id)
  if (bets === 'loading') bets = []

  // const allItems = [...bets.map(toFeedBet), ...activity]
  const allItems = bets.map(toFeedBet)

  // TODO: aggregate bets across each day window

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
                {activityItem.type === 'comment' ? (
                  <FeedComment activityItem={activityItem} />
                ) : activityItem.type === 'bet' ? (
                  <FeedBet activityItem={activityItem} />
                ) : activityItem.type === 'tags' ? (
                  <FeedTags activityItem={activityItem} />
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
