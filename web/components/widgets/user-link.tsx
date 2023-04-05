import { linkClass, SiteLink } from 'web/components/widgets/site-link'
import clsx from 'clsx'
import {
  BOT_USERNAMES,
  CHECK_USERNAMES,
  CORE_USERNAMES,
} from 'common/envs/constants'
import { ShieldCheckIcon, SparklesIcon } from '@heroicons/react/solid'
import { Tooltip } from './tooltip'
import { BadgeCheckIcon } from '@heroicons/react/outline'
import { Row } from '../layout/row'
import { Avatar } from './avatar'
import { DAY_MS } from 'common/util/time'
import ScalesIcon from 'web/lib/icons/scales-icon'

export const isFresh = (createdTime: number) =>
  createdTime > Date.now() - DAY_MS * 14
export function shortenName(name: string) {
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
  className?: string
}) {
  const { name, username, avatarUrl, className } = props
  return (
    <Row className={clsx('items-center gap-4', className)}>
      <Avatar avatarUrl={avatarUrl} username={username} size={8} />
      <UserLink name={name} username={username} />
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
        className={clsx(
          'inline-flex flex-row items-center gap-1',
          linkClass,
          className
        )}
      >
        {children}
      </div>
    )
  }
  return (
    <SiteLink
      href={`/${username}`}
      className={clsx('inline-flex flex-row items-center gap-1', className)}
      followsLinkClass
    >
      {children}
    </SiteLink>
  )
}

function BotBadge() {
  return (
    <span className="bg-ink-100 text-ink-800 ml-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium">
      Bot
    </span>
  )
}

export function PostBanBadge() {
  return (
    <Tooltip text="Can't create comments, posts, or markets" placement="bottom">
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
    badges.push(<BotBadge />)
  }
  if (CORE_USERNAMES.includes(username)) {
    badges.push(<CoreBadge />)
  }
  if (CHECK_USERNAMES.includes(username)) {
    badges.push(<CheckBadge />)
  }
  if (fresh) {
    badges.push(<FreshBadge />)
  }
  if (marketCreator) {
    badges.push(<MarketCreatorBadge />)
  }
  return <>{badges}</>
}

// Show a special checkmark next to Core team members
function CoreBadge() {
  return (
    <Tooltip text="I work on Manifold!" placement="right">
      <ShieldCheckIcon
        className="text-primary-700 h-4 w-4"
        aria-hidden="true"
      />
    </Tooltip>
  )
}

// Show a normal checkmark next to our trustworthy users
function CheckBadge() {
  return (
    <Tooltip text="Trustworthy. ish." placement="right">
      <BadgeCheckIcon className="text-primary-700 h-4 w-4" aria-hidden="true" />
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
    <Tooltip text="Market Creator" placement="right">
      <ScalesIcon className="h-4 w-4 text-amber-400" aria-hidden="true" />
    </Tooltip>
  )
}
