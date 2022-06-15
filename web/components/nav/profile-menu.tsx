import Link from 'next/link'

import { User } from 'web/lib/firebase/users'
import { formatMoney } from 'common/util/format'
import { Avatar } from '../avatar'
import { trackCallback } from 'web/lib/service/analytics'

export function ProfileSummary(props: { user: User }) {
  const { user } = props
  return (
    <Link href={`/${user.username}`}>
      <a
        onClick={trackCallback('sidebar: profile')}
        className="group flex flex-row items-center gap-4 rounded-md py-3 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        <Avatar avatarUrl={user.avatarUrl} username={user.username} noLink />

        <div className="truncate">
          <div>{user.name}</div>
          <div className="text-sm">{formatMoney(Math.floor(user.balance))}</div>
        </div>
      </a>
    </Link>
  )
}
