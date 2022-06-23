import Router from 'next/router'
import clsx from 'clsx'
import { MouseEvent } from 'react'
import { UserCircleIcon, UserIcon, UsersIcon } from '@heroicons/react/solid'

export function Avatar(props: {
  username?: string
  avatarUrl?: string
  noLink?: boolean
  size?: number | 'xs' | 'sm'
  className?: string
}) {
  const { username, avatarUrl, noLink, size, className } = props
  const s = size == 'xs' ? 6 : size === 'sm' ? 8 : size || 10

  const onClick =
    noLink && username
      ? undefined
      : (e: MouseEvent) => {
          e.stopPropagation()
          Router.push(`/${username}`)
        }

  // there can be no avatar URL or username in the feed, we show a "submit comment"
  // item with a fake grey user circle guy even if you aren't signed in
  return avatarUrl ? (
    <img
      className={clsx(
        'flex-shrink-0 rounded-full bg-white object-cover',
        `w-${s} h-${s}`,
        !noLink && 'cursor-pointer',
        className
      )}
      src={avatarUrl}
      onClick={onClick}
      alt={username}
    />
  ) : (
    <UserCircleIcon
      className={clsx(
        `flex-shrink-0 rounded-full bg-white w-${s} h-${s} text-gray-500`,
        className
      )}
      aria-hidden="true"
    />
  )
}

export function EmptyAvatar(props: { size?: number; multi?: boolean }) {
  const { size = 8, multi } = props
  const insize = size - 3
  const Icon = multi ? UsersIcon : UserIcon

  return (
    <div
      className={`flex h-${size} w-${size} items-center justify-center rounded-full bg-gray-200`}
    >
      <Icon className={`h-${insize} w-${insize} text-gray-500`} aria-hidden />
    </div>
  )
}
