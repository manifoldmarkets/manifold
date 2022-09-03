import { SiteLink } from 'web/components/site-link'
import clsx from 'clsx'

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
}) {
  const { name, username, className, short } = props
  const shortName = short ? shortenName(name) : name
  return (
    <SiteLink
      href={`/${username}`}
      className={clsx('z-10 truncate', className)}
    >
      {shortName}
    </SiteLink>
  )
}
