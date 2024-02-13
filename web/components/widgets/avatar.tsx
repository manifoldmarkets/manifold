import Router from 'next/router'
import clsx from 'clsx'
import { memo, MouseEvent, useEffect, useState } from 'react'
import { UserCircleIcon, UserIcon, UsersIcon } from '@heroicons/react/solid'
import Image from 'next/image'
import { floor } from 'lodash'
import { useDisplayUser } from 'web/hooks/use-user'

export const Avatar = (props: {
  userId: string
  noLink?: boolean
  size?: AvatarSizeType
  className?: string
  preventDefault?: boolean
}) => {
  const { userId, noLink, size = 'md', className, preventDefault } = props
  const user = useDisplayUser(userId)

  const s = sizeToPx(size)

  if (user === null || user === 'not-found') {
    return <EmptyAvatar size={s} />
  }

  if (user === 'loading') {
    return <LoadingAvatar size={size} className={className} />
  }

  return (
    <RawAvatar
      username={user?.username}
      avatarUrl={user?.avatarUrl}
      noLink={noLink}
      size={size}
      className={className}
      preventDefault={preventDefault}
    />
  )
}

export type AvatarSizeType = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const sizeToPx = (size: AvatarSizeType) => {
  switch (size) {
    case '2xs':
      return 4
    case 'xs':
      return 6
    case 'sm':
      return 8
    case 'md':
      return 10
    case 'lg':
      return 12
    case 'xl':
      return 24
  }
}

export const RawAvatar = memo(
  (props: {
    username?: string
    avatarUrl?: string
    noLink?: boolean
    size?: AvatarSizeType
    className?: string
    preventDefault?: boolean
  }) => {
    const { username, noLink, size = 'md', className, preventDefault } = props
    const [avatarUrl, setAvatarUrl] = useState(props.avatarUrl)
    useEffect(() => setAvatarUrl(props.avatarUrl), [props.avatarUrl])
    const s = sizeToPx(size)

    const onClick = (e: MouseEvent) => {
      if (!noLink && username) {
        if (preventDefault) {
          e.preventDefault()
        }
        e.stopPropagation()
        Router.push(`/${username}`)
      }
    }

    // there can be no avatar URL or username in the feed, we show a "submit comment"
    // item with a fake grey user circle guy even if you aren't signed in
    return avatarUrl ? (
      <Image
        width={s * 4}
        height={s * 4}
        className={clsx(
          'bg-canvas-0 my-0 flex-shrink-0 rounded-full object-cover',
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
          `bg-canvas-0 flex-shrink-0 rounded-full w-${s} h-${s} text-ink-500`,
          className
        )}
        aria-hidden="true"
      />
    )
  }
)

export function LoadingAvatar(props: {
  className?: string
  size?: AvatarSizeType
}) {
  const { className, size = 'md' } = props

  const s = sizeToPx(size)

  return (
    <div
      className={clsx(
        `dark:bg-ink-400 bg-ink-200 flex-shrink-0 rounded-full w-${s} h-${s} animate-pulse`,
        className
      )}
    />
  )
}

export function EmptyAvatar(props: {
  className?: string
  size?: number
  multi?: boolean
}) {
  const { className, size = 8, multi } = props
  const insize = size - floor(size / 3)
  const Icon = multi ? UsersIcon : UserIcon

  return (
    <div
      className={clsx(
        `flex flex-shrink-0 h-${size} w-${size} bg-ink-200 items-center justify-center rounded-full`,
        className
      )}
    >
      <Icon className={`h-${insize} w-${insize} text-ink-500`} aria-hidden />
    </div>
  )
}
