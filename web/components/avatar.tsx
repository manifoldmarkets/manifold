import Router from 'next/router'
import clsx from 'clsx'
import { UserCircleIcon } from '@heroicons/react/solid'

export function Avatar(props: {
  username?: string
  avatarUrl?: string
  noLink?: boolean
  size?: number
}) {
  const { username, avatarUrl, noLink, size } = props
  const s = size || 10

  const onClick =
    noLink && username
      ? undefined
      : (e: any) => {
          e.stopPropagation()
          Router.push(`/${username}`)
        }
  return (
    <div className={`rounded-full bg-white w-${s} h-${s}`}>
      {avatarUrl ? (
        <img
          className={clsx(
            'rounded-full bg-gray-400 flex items-center justify-center',
            !noLink && 'cursor-pointer'
          )}
          src={avatarUrl}
          width={40}
          height={40}
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
