import { firebaseLogout, User } from '../lib/firebase/users'
import { formatMoney } from '../lib/util/format'
import { Avatar } from './avatar'
import { Col } from './layout/col'
import { MenuButton } from './menu'

export function ProfileMenu(props: { user: User | undefined }) {
  const { user } = props

  return (
    <>
      <MenuButton
        className="hidden md:block"
        menuItems={getNavigationOptions(user, { mobile: false })}
        buttonContent={<ProfileSummary user={user} />}
      />

      <MenuButton
        className="md:hidden mr-2"
        menuItems={getNavigationOptions(user, { mobile: true })}
        buttonContent={<ProfileSummary user={user} />}
      />
    </>
  )
}

function getNavigationOptions(
  user: User | undefined,
  options: { mobile: boolean }
) {
  const { mobile } = options
  return [
    {
      name: 'Home',
      href: user ? '/home' : '/',
    },
    ...(mobile
      ? [
          {
            name: 'Markets',
            href: '/markets',
          },
          {
            name: 'Folds',
            href: '/folds',
          },
        ]
      : []),
    {
      name: 'Your trades',
      href: '/trades',
    },
    {
      name: 'Your markets',
      href: `/${user?.username ?? ''}`,
    },
    {
      name: 'Leaderboards',
      href: '/leaderboards',
    },
    {
      name: 'Discord',
      href: 'https://discord.gg/eHQBNBqXuh',
    },
    {
      name: 'About',
      href: '/about',
    },
    {
      name: 'Sign out',
      href: '#',
      onClick: () => firebaseLogout(),
    },
  ]
}

function ProfileSummary(props: { user: User | undefined }) {
  const { user } = props
  return (
    <Col className="avatar items-center sm:flex-row gap-2 sm:gap-4">
      <Avatar avatarUrl={user?.avatarUrl} username={user?.username} noLink />

      <div className="truncate text-left sm:w-32">
        <div className="hidden sm:flex">{user?.name}</div>
        <div className="text-gray-700 text-sm">
          {user ? formatMoney(Math.floor(user.balance)) : ' '}
        </div>
      </div>
    </Col>
  )
}
