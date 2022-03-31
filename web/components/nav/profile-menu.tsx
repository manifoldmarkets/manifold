import { firebaseLogout, User } from '../../lib/firebase/users'
import { formatMoney } from '../../../common/util/format'
import { Avatar } from '../avatar'
import { IS_PRIVATE_MANIFOLD } from '../../../common/envs/constants'
import { Row } from '../layout/row'

export function getNavigationOptions(user?: User | null) {
  if (IS_PRIVATE_MANIFOLD) {
    return [{ name: 'Leaderboards', href: '/leaderboards' }]
  }

  if (!user) {
    return [
      { name: 'Leaderboards', href: '/leaderboards' },
      { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
    ]
  }

  return [
    { name: 'Your trades', href: '/trades' },
    { name: 'Add funds', href: '/add-funds' },
    { name: 'Leaderboards', href: '/leaderboards' },
    { name: 'Discord', href: 'https://discord.gg/eHQBNBqXuh' },
    { name: 'Sign out', href: '#', onClick: () => firebaseLogout() },
  ]
}

export function ProfileSummary(props: { user: User | undefined }) {
  const { user } = props
  return (
    <Row className="group avatar my-3 items-center gap-4 rounded-md py-3 text-gray-600 group-hover:bg-gray-100 group-hover:text-gray-900">
      <Avatar avatarUrl={user?.avatarUrl} username={user?.username} noLink />

      <div className="truncate text-left">
        <div>{user?.name}</div>
        <div className="text-sm">
          {user ? formatMoney(Math.floor(user.balance)) : ' '}
        </div>
      </div>
    </Row>
  )
}
