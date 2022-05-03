import Router from 'next/router'
import clsx from 'clsx'
import { UserCircleIcon } from '@heroicons/react/solid'

export function Avatar(props: {
  username?: string
  avatarUrl?: string
  noLink?: boolean
  size?: number | 'xs' | 'sm'
  className?: string
  containerClassName?: string
}) {
  const { username, avatarUrl, noLink, size, className, containerClassName } =
    props
  const s = size == 'xs' ? 6 : size === 'sm' ? 8 : size || 10

  const onClick =
    noLink && username
      ? undefined
      : (e: any) => {
          e.stopPropagation()
          Router.push(`/${username}`)
        }
  return (
    <div
      className={clsx(
        `flex-shrink-0 rounded-full bg-white w-${s} h-${s}`,
        containerClassName
      )}
    >
      {avatarUrl ? (
        <img
          className={clsx(
            'rounded-full object-cover',
            `w-${s} h-${s}`,
            !noLink && 'cursor-pointer',
            className
          )}
          src={avatarUrl}
          onClick={onClick}
          alt={username}
        />
      ) : (
        // TODO: After 2022-03-01, can just assume that all contracts have an avatarUrl
        <UserCircleIcon
          className={`w-${s} h-${s} text-gray-500`}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
