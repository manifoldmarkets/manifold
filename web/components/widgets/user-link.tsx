import Link from 'next/link'
import clsx from 'clsx'
import {
  BOT_USERNAMES,
  MOD_USERNAMES,
  VERIFIED_USERNAMES,
  CORE_USERNAMES,
  MVP,
} from 'common/envs/constants'
import { SparklesIcon } from '@heroicons/react/solid'
import { Tooltip } from './tooltip'
import { BadgeCheckIcon, ShieldCheckIcon } from '@heroicons/react/outline'
import { Row } from '../layout/row'
import { Avatar } from './avatar'
import { DAY_MS } from 'common/util/time'
import ScalesIcon from 'web/lib/icons/scales-icon.svg'
import { linkClass } from './site-link'
import Foldy from '/public/logo.svg'
import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { BsFillArrowThroughHeartFill } from 'react-icons/bs'

export const isFresh = (createdTime: number) =>
  createdTime > Date.now() - DAY_MS * 14

function shortenName(name: string) {
  const firstName = name.split(' ')[0]
  const maxLength = 11
  const shortName =
    firstName.length >= 3 && name.length > maxLength
      ? firstName.length < maxLength
        ? firstName
        : firstName.substring(0, maxLength - 3) + '...'
      : name.length > maxLength
      ? name.substring(0, maxLength - 3) + '...'
      : name
  return shortName
}

export function UserAvatarAndBadge(props: {
  name: string
  username: string
  avatarUrl?: string
  noLink?: boolean
  className?: string
}) {
  const { name, username, avatarUrl, noLink, className } = props
  return (
    <Row className={clsx('items-center gap-2', className)}>
      <Avatar
        avatarUrl={avatarUrl}
        username={username}
        size={'sm'}
        noLink={noLink}
      />
      <UserLink name={name} username={username} noLink={noLink} />
    </Row>
  )
}

export function UserLink(props: {
  name: string
  username: string
  className?: string
  short?: boolean
  noLink?: boolean
  createdTime?: number
  hideBadge?: boolean
  marketCreator?: boolean
}) {
  const {
    name,
    username,
    className,
    short,
    noLink,
    createdTime,
    hideBadge,
    marketCreator,
  } = props
  const fresh = createdTime ? isFresh(createdTime) : false
  const shortName = short ? shortenName(name) : name
  const children = (
    <>
      <span className="max-w-[200px] truncate">{shortName}</span>
      {!hideBadge && (
        <UserBadge
          username={username}
          fresh={fresh}
          marketCreator={marketCreator}
        />
      )}
    </>
  )
  if (noLink) {
    return (
      <div
        className={clsx('inline-flex flex-row items-center gap-1', className)}
      >
        {children}
      </div>
    )
  }
  return (
    <Link
      href={`/${username}`}
      className={clsx(
        linkClass,
        'inline-flex flex-row items-center gap-1',
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  )
}

function BotBadge() {
  return (
    <span className="bg-ink-100 text-ink-800 ml-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium">
      Bot
    </span>
  )
}

export function PostBanBadge() {
  return (
    <Tooltip
      text="Can't create comments, posts, or questions"
      placement="bottom"
    >
      <span className="ml-1.5 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
        Banned
      </span>
    </Tooltip>
  )
}

export function UserBadge(props: {
  username: string
  fresh?: boolean
  marketCreator?: boolean
}) {
  const { username, fresh, marketCreator } = props
  const badges = []
  if (BOT_USERNAMES.includes(username)) {
    badges.push(<BotBadge key="bot" />)
  }
  if (CORE_USERNAMES.includes(username)) {
    badges.push(<CoreBadge key="core" />)
  }
  if (MOD_USERNAMES.includes(username)) {
    badges.push(<ModBadge key="mod" />)
  }
  if (MVP.includes(username)) {
    badges.push(<MVPBadge key="mvp" />)
  }
  if (VERIFIED_USERNAMES.includes(username)) {
    badges.push(<VerifiedBadge key="check" />)
  }
  if (fresh) {
    badges.push(<FreshBadge key="fresh" />)
  }
  if (marketCreator) {
    badges.push(<MarketCreatorBadge key="creator" />)
  }
  return <>{badges}</>
}

// Show a special checkmark next to Core team members
function CoreBadge() {
  return (
    <Tooltip text="I work on Manifold!" placement="right">
      <Foldy
        className="stoke-indigo-700 h-4 w-4 stroke-1 hover:rotate-12 dark:stroke-indigo-300"
        aria-hidden
      />
    </Tooltip>
  )
}

// Show a normal checkmark next to our mods
function ModBadge() {
  return (
    <Tooltip text="Moderator" placement="right">
      <ShieldCheckIcon
        className="h-4 w-4 text-purple-700 dark:text-purple-400"
        aria-hidden="true"
      />
    </Tooltip>
  )
}
function MVPBadge() {
  return (
    <Tooltip text="MVP" placement="right">
      <BsFillArrowThroughHeartFill
        className="h-4 w-4 text-purple-700 dark:text-purple-400"
        aria-hidden="true"
      />
    </Tooltip>
  )
}

// Show a normal checkmark next to our verified users
function VerifiedBadge() {
  return (
    <Tooltip text="Verified" placement="right">
      <BadgeCheckIcon className="text-primary-700 h-4 w-4" aria-hidden />
    </Tooltip>
  )
}

// Show a fresh badge next to new users
function FreshBadge() {
  return (
    <Tooltip text="I'm new here!" placement="right">
      <SparklesIcon className="h-4 w-4 text-green-500" aria-hidden="true" />
    </Tooltip>
  )
}

function MarketCreatorBadge() {
  return (
    <Tooltip text="Question Creator" placement="right">
      <ScalesIcon className="h-4 w-4 text-amber-400" aria-hidden="true" />
    </Tooltip>
  )
}

export const StackedUserNames = (props: {
  user: User
  followsYou?: boolean
  className?: string
  usernameClassName?: string
}) => {
  const { user, followsYou, usernameClassName, className } = props
  return (
    <Col>
      <div className={'inline-flex flex-row items-center gap-1 pt-1'}>
        <span className={clsx('break-anywhere ', className)}>{user.name}</span>
        {
          <UserBadge
            username={user.username}
            fresh={isFresh(user.createdTime)}
          />
        }
        {user.isBannedFromPosting && <PostBanBadge />}
      </div>
      <Row className={'max-w-[8rem] flex-shrink flex-wrap gap-2 sm:max-w-none'}>
        <span className={clsx('text-ink-400 text-sm', usernameClassName)}>
          @{user.username}{' '}
        </span>
        {followsYou && (
          <span
            className={
              'bg-ink-200 w-fit self-center rounded-md p-0.5 px-1 text-xs'
            }
          >
            Follows you
          </span>
        )}
      </Row>
    </Col>
  )
}
