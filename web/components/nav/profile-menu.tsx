import Link from 'next/link'
import { firebaseLogout, User } from 'web/lib/firebase/users'
import { formatMoney } from 'common/util/format'
import { Avatar } from '../avatar'
import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'

export function ProfileSummary(props: { user: User }) {
  const { user } = props
  return (
    <Link href={`/${user.username}`}>
      <a className="group flex flex-row items-center gap-4 rounded-md py-3 text-gray-500 hover:bg-gray-100 hover:text-gray-700">
        <Avatar avatarUrl={user.avatarUrl} username={user.username} noLink />

        <div className="truncate">
          <div>{user.name}</div>
          <div className="text-sm">{formatMoney(Math.floor(user.balance))}</div>
        </div>
      </a>
    </Link>
  )
}
