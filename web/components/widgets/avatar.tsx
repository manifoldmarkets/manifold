import Router from 'next/router'
import clsx from 'clsx'
import { MouseEvent, useEffect, useState } from 'react'
import { UserCircleIcon, UserIcon, UsersIcon } from '@heroicons/react/solid'
import Image from 'next/image'
import { floor } from 'lodash'
import { isFresh } from './user-link'
import { LuSprout } from 'react-icons/lu'
import { TbCrown } from 'react-icons/tb'
import { GOLDEN_CROWN_ID } from 'common/src/shop/types'
import { useUserEntitlements } from 'web/hooks/use-user-entitlements'

export type AvatarSizeType = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export const Avatar = (props: {
  userId?: string
  username?: string
  avatarUrl?: string
  noLink?: boolean
  size?: AvatarSizeType
  className?: string
  preventDefault?: boolean
  createdTime?: number
}) => {
  const {
    userId,
    username,
    noLink,
    size,
    className,
    preventDefault,
    createdTime,
  } = props
  const entitlements = useUserEntitlements(userId)
  const hasGoldenCrown =
    !!userId && entitlements?.some((e) => e.entitlementId === GOLDEN_CROWN_ID)

  // Debug logging
  if (userId === 'uglwf3YKOZNGjjEXKc5HampOFRE2') {
    console.log('Crown debug (render):', {
      userId,
      entitlements,
      hasGoldenCrown,
      GOLDEN_CROWN_ID,
      renderTime: Date.now(),
    })
    if (entitlements) {
      console.log(
        'Checking entitlements:',
        entitlements.map((e) => ({
          id: e.entitlementId,
          matches: e.entitlementId === GOLDEN_CROWN_ID,
        }))
      )
    }
  }
  const [avatarUrl, setAvatarUrl] = useState(props.avatarUrl)
  useEffect(() => setAvatarUrl(props.avatarUrl), [props.avatarUrl])
  const s =
    size == '2xs'
      ? 4
      : size == 'xs'
      ? 6
      : size == 'sm'
      ? 8
      : size == 'md'
      ? 10
      : size == 'lg'
      ? 12
      : size == 'xl'
      ? 24
      : 10
  const sizeInPx = s * 4

  const isUserFresh = createdTime ? isFresh(createdTime) : false

  // Check if the avatar URL is a GIF (potentially animated) and exclude it
  const isAnimatedFormat = avatarUrl?.toLowerCase().match(/\.gif(\?|$)/)
  const shouldShowImage = avatarUrl && !isAnimatedFormat

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
  return (
    <div className={isUserFresh || hasGoldenCrown ? 'relative' : ''}>
      {shouldShowImage ? (
        <Image
          width={sizeInPx}
          height={sizeInPx}
          className={clsx(
            'bg-canvas-0 my-0 flex-shrink-0 rounded-full object-cover',
            `w-${s} h-${s}`,
            !noLink && 'cursor-pointer',
            className,
            isUserFresh && 'ring-1 ring-green-500',
            hasGoldenCrown && 'ring-1 ring-yellow-400'
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
            className,
            isUserFresh && 'ring-1 ring-green-500',
            hasGoldenCrown && 'ring-1 ring-yellow-400'
          )}
          onClick={onClick}
        />
      )}
      {isUserFresh && (
        <div className="absolute -right-2 -top-[0.41rem] rotate-45">
          <LuSprout className="h-4 w-4 text-green-500" />
        </div>
      )}
      {hasGoldenCrown && (
        <div className="absolute -right-2 -top-[0.41rem] rotate-45">
          <TbCrown className="h-4 w-4 text-yellow-400" />
        </div>
      )}
    </div>
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
