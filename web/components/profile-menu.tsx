import Image from 'next/image'
import { firebaseLogout, User } from '../lib/firebase/users'
import { formatMoney } from '../lib/util/format'
import { Col } from './layout/col'
import { MenuButton } from './menu'

export function ProfileMenu(props: { user: User }) {
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

function getNavigationOptions(user: User, options: { mobile: boolean }) {
  const { mobile } = options
  return [
    {
      name: 'Home',
      href: '/',
    },
    ...(mobile
      ? [
          {
            name: 'All markets',
            href: '/markets',
          },
          {
            name: 'Create a market',
            href: '/create',
          },
        ]
      : []),
    {
      name: 'Your trades',
      href: '/trades',
    },
    {
      name: 'Your markets',
      href: `/${user.username}`,
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

function ProfileSummary(props: { user: User }) {
  const { user } = props
  return (
    <Col className="avatar items-center sm:flex-row gap-2 sm:gap-0">
      <div className="rounded-full w-10 h-10 sm:mr-4">
        <Image src={user.avatarUrl} width={40} height={40} />
      </div>
      <div className="truncate text-left" style={{ maxWidth: 170 }}>
        <div className="hidden sm:flex">{user.name}</div>
        <div className="text-gray-700 text-sm">
          {formatMoney(Math.floor(user.balance))}
        </div>
      </div>
    </Col>
  )
}
