import clsx from 'clsx'
import { UserEntitlement } from 'common/shop/types'
import Link from 'next/link'
import { UserHovercard } from '../user/user-hovercard'
import { UserBadge } from '../widgets/user-link'

export function SocialUserLink({
  user,
  label = 'name',
  className,
}: {
  user: {
    id: string
    username: string
    name?: string
    entitlements?: UserEntitlement[]
  }
  label?: 'name' | 'handle'
  className?: string
}) {
  return (
    <span className="inline-flex w-fit min-w-0 max-w-full items-baseline gap-1 align-baseline">
      <UserHovercard userId={user.id} asChild stopClickPropagation>
        <Link
          href={`/${encodeURIComponent(user.username)}`}
          prefetch={false}
          className={clsx(
            'inline-block w-fit min-w-0 max-w-full truncate hover:underline',
            className
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {label === 'handle'
            ? `@${user.username}`
            : user.name ?? user.username}
        </Link>
      </UserHovercard>
      {label === 'name' && (
        <span
          className="pointer-events-none inline-flex shrink-0 items-center gap-1 self-center"
          aria-hidden="true"
        >
          <UserBadge
            userId={user.id}
            username={user.username}
            entitlements={user.entitlements}
            displayContext="posts"
          />
        </span>
      )}
    </span>
  )
}
