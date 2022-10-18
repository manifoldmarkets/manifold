import Router from 'next/router'
import clsx from 'clsx'
import { MouseEvent, useEffect, useState } from 'react'
import { UserCircleIcon, UserIcon, UsersIcon } from '@heroicons/react/solid'
import Image from 'next/future/image'

export function Avatar(props: {
  username?: string
  avatarUrl?: string
  noLink?: boolean
  size?: number | 'xxs' | 'xs' | 'sm'
  className?: string
}) {
  const { username, noLink, size, className } = props
  const [avatarUrl, setAvatarUrl] = useState(props.avatarUrl)
  useEffect(() => setAvatarUrl(props.avatarUrl), [props.avatarUrl])
  const s =
    size == 'xxs' ? 4 : size == 'xs' ? 6 : size === 'sm' ? 8 : size || 10
  const sizeInPx = s * 4

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
    <Image
      width={sizeInPx}
      height={sizeInPx}
      className={clsx(
        'my-0 flex-shrink-0 rounded-full bg-white object-cover',
        `w-${s} h-${s}`,
        !noLink && 'cursor-pointer',
        className
      )}
      style={{ maxWidth: `${s * 0.25}rem` }}
      src={avatarUrl}
      onClick={onClick}
      alt={`${username ?? 'Unknown user'} avatar`}
      onError={() => {
        // If the image doesn't load, clear the avatarUrl to show the default
        // Mostly for localhost, when getting a 403 from googleusercontent
        setAvatarUrl('')
      }}
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

export function EmptyAvatar(props: {
  className?: string
  size?: number
  multi?: boolean
}) {
  const { className, size = 8, multi } = props
  const insize = size - 3
  const Icon = multi ? UsersIcon : UserIcon

  return (
    <div
      className={clsx(
        `flex flex-shrink-0 h-${size} w-${size} items-center justify-center rounded-full bg-gray-200`,
        className
      )}
    >
      <Icon className={`h-${insize} w-${insize} text-gray-500`} aria-hidden />
    </div>
  )
}
