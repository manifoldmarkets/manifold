import Image from 'next/image'
import { firebaseLogout, User } from '../lib/firebase/users'
import { formatMoney } from '../lib/util/format'
import { Row } from './layout/row'
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
        className="md:hidden"
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
          { name: 'About', href: '/about' },
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
      name: 'Sign out',
      href: '#',
      onClick: () => firebaseLogout(),
    },
  ]
}

function ProfileSummary(props: { user: User }) {
  const { user } = props
  return (
    <Row className="avatar items-center">
      <div className="rounded-full w-10 h-10 mr-4">
        <Image src={user.avatarUrl} width={40} height={40} />
      </div>
      <div className="truncate text-left" style={{ maxWidth: 140 }}>
        {user.name}
        <div className="text-gray-700 text-sm">{formatMoney(user.balance)}</div>
      </div>
    </Row>
  )
}
