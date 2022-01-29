import Router from 'next/router'
import clsx from 'clsx'

export function Avatar(props: {
  username?: string
  avatarUrl?: string
  noLink?: boolean
}) {
  const { username, avatarUrl, noLink } = props

  const onClick =
    noLink && username
      ? undefined
      : (e: any) => {
          e.stopPropagation()
          Router.push(`/${username}`)
        }
  return (
    <div className="rounded-full bg-gray-400 w-10 h-10">
      <img
        className={clsx(
          'rounded-full bg-gray-400 flex items-center justify-center',
          !noLink && 'cursor-pointer',
          !avatarUrl && 'hidden'
        )}
        src={avatarUrl}
        width={40}
        height={40}
        onClick={onClick}
        alt={username}
      />
    </div>
  )
}
