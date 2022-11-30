import { SiteLink } from 'web/components/widgets/site-link'
import clsx from 'clsx'
import { BOT_USERNAMES, CORE_USERNAMES } from 'common/envs/constants'
import { ShieldCheckIcon } from '@heroicons/react/solid'
import { Tooltip } from './tooltip'

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

export function UserLink(props: {
  name: string
  username: string
  className?: string
  short?: boolean
  noLink?: boolean
}) {
  const { name, username, className, short, noLink } = props
  const shortName = short ? shortenName(name) : name
  return (
    <SiteLink
      href={`/${username}`}
      className={clsx(
        'max-w-[120px] truncate [@media(min-width:450px)]:max-w-[200px]',
        className,
        noLink && 'pointer-events-none'
      )}
    >
      <div className="inline-flex flex-row items-center gap-1">
        {shortName}
        {BOT_USERNAMES.includes(username) && <BotBadge />}
        {CORE_USERNAMES.includes(username) && <CoreBadge />}
      </div>
    </SiteLink>
  )
}

export function BotBadge() {
  return (
    <span className="ml-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
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

// Show a checkmark next to Core team members
export function CoreBadge() {
  return (
    <Tooltip text="Manifold team member" placement="right">
      <ShieldCheckIcon className="h-4 w-4 text-indigo-700" aria-hidden="true" />
    </Tooltip>
  )
}
