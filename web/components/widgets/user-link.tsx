import { SiteLink } from 'web/components/widgets/site-link'
import clsx from 'clsx'
import { BOT_USERNAMES } from 'common/envs/constants'

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
        'z-10 max-w-[120px] truncate [@media(min-width:450px)]:max-w-[200px]',
        className,
        noLink && 'pointer-events-none'
      )}
    >
      {shortName}
      {BOT_USERNAMES.includes(username) && <BotBadge />}
    </SiteLink>
  )
}

export function BotBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
      Bot
    </span>
  )
}
