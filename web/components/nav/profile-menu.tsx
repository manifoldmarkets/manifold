import { firebaseLogout, User } from '../../lib/firebase/users'
import { formatMoney } from '../../../common/util/format'
import { Avatar } from '../avatar'
import { IS_PRIVATE_MANIFOLD } from '../../../common/envs/constants'
import { Row } from '../layout/row'

export function getNavigationOptions() {
  return [
    {
      name: 'Your trades',
      href: '/trades',
    },
    // Disable irrelevant menu options for teams.
    ...(IS_PRIVATE_MANIFOLD
      ? [
          {
            name: 'Leaderboards',
            href: '/leaderboards',
          },
        ]
      : [
          {
            name: 'Add funds',
            href: '/add-funds',
          },
          {
            name: 'Leaderboards',
            href: '/leaderboards',
          },
          {
            name: 'Discord',
            href: 'https://discord.gg/eHQBNBqXuh',
          },
        ]),
    {
      name: 'Sign out',
      href: '#',
      onClick: () => firebaseLogout(),
    },
  ]
}

export function ProfileSummary(props: { user: User | undefined }) {
  const { user } = props
  return (
    <Row className="group avatar items-center gap-4 py-6 text-gray-600 group-hover:text-gray-900">
      <Avatar avatarUrl={user?.avatarUrl} username={user?.username} noLink />

      <div className="truncate text-left sm:w-32">
        <div className="hidden sm:flex">{user?.name}</div>
        <div className="text-sm">
          {user ? formatMoney(Math.floor(user.balance)) : ' '}
        </div>
      </div>
    </Row>
  )
}
