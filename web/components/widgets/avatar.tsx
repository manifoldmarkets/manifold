import Router from 'next/router'
import clsx from 'clsx'
import { memo, MouseEvent, useEffect, useState } from 'react'
import { UserCircleIcon, UserIcon, UsersIcon } from '@heroicons/react/solid'
import Image from 'next/image'
import { floor } from 'lodash'
import { useLeagueInfo, useLeagueInfoFromUsername } from 'web/hooks/use-leagues'
import { DIVISION_NAMES } from 'common/leagues'
import { LeagueRing } from './league-ring'

function floorToEven(num: number) {
  return num - (num % 2)
}

export const Avatar = memo(
  (props: {
    username?: string
    avatarUrl?: string
    noLink?: boolean
    size?: number | '2xs' | 'xs' | 'sm'
    className?: string
    preventDefault?: boolean
  }) => {
    const { username, noLink, size, className, preventDefault } = props
    const [avatarUrl, setAvatarUrl] = useState(props.avatarUrl)
    useEffect(() => setAvatarUrl(props.avatarUrl), [props.avatarUrl])

    const leagueInfo = useLeagueInfoFromUsername(username)
    const s =
      size == '2xs' ? 4 : size == 'xs' ? 6 : size === 'sm' ? 8 : size || 10
    const sizeInPx = s * 4
    const innerSizeInPx = floorToEven(Math.floor(sizeInPx * 0.8))

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
      <LeagueRing
        size={sizeInPx}
        className={className}
        league={leagueInfo ? DIVISION_NAMES[leagueInfo.division] : ''}
      >
        <div
          className="relative overflow-hidden rounded-full"
          style={{
            width: `${innerSizeInPx}px`,
            height: `${innerSizeInPx}px`,
          }}
        >
          <Image
            layout="fill"
            className={clsx(
              ' object-cover',
              !noLink && 'cursor-pointer rounded-full'
            )}
            src={avatarUrl}
            onClick={onClick}
            alt={`${username ?? 'Unknown user'} avatar`}
            onError={() => {
              // If the image doesn't load, clear the avatarUrl to show the default
              // Mostly for localhost, when getting a 403 from googleusercontent
              setAvatarUrl('')
            }}
          />
        </div>
      </LeagueRing>
    ) : (
      <LeagueRing
        league={leagueInfo ? DIVISION_NAMES[leagueInfo.division] : ''}
        size={sizeInPx}
        className={className}
      >
        <UserCircleIcon
          style={{ height: `${innerSizeInPx}px`, width: `${innerSizeInPx}px` }}
          className={clsx(
            `bg-canvas-0 text-ink-500 flex-shrink-0 rounded-full`
          )}
          aria-hidden="true"
        />
      </LeagueRing>
    )
  }
)

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
