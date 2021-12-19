import clsx from 'clsx'
import Link from 'next/link'
import Image from 'next/image'

import { useUser } from '../hooks/use-user'
import { formatMoney } from '../lib/util/format'
import { Row } from './layout/row'
import { firebaseLogin, User } from '../lib/firebase/users'
import { MenuButton } from './menu'

const hoverClasses =
  'hover:underline hover:decoration-indigo-400 hover:decoration-2'

const mobileNavigation = [
  {
    name: 'Home',
    href: '/',
  },
  {
    name: 'Account',
    href: '/account',
  },
  {
    name: 'Your bets',
    href: '/bets',
  },
  {
    name: 'Create a market',
    href: '/create',
  },
]

function ProfileSummary(props: { user: User }) {
  const { user } = props
  return (
    <Row className="avatar items-center">
      <div className="rounded-full w-10 h-10 mr-4">
        <Image src={user.avatarUrl} width={40} height={40} />
      </div>
      <div className="truncate" style={{ maxWidth: 175 }}>
        {user.name}
        <div className="text-gray-700 text-sm">{formatMoney(user.balance)}</div>
      </div>
    </Row>
  )
}

function SignedInHeaders(props: { user: User; themeClasses?: string }) {
  const { user, themeClasses } = props

  return (
    <>
      <Link href="/create">
        <a
          className={clsx(
            'text-base hidden md:block whitespace-nowrap',
            themeClasses
          )}
        >
          Create a market
        </a>
      </Link>

      <Link href="/bets">
        <a
          className={clsx(
            'text-base hidden md:block whitespace-nowrap',
            themeClasses
          )}
        >
          Your bets
        </a>
      </Link>

      <Link href="/account">
        <a
          className={clsx(
            'text-base hidden md:block hover:underline hover:decoration-2 hover:decoration-indigo-700'
          )}
        >
          <ProfileSummary user={user} />
        </a>
      </Link>

      <MenuButton
        className="md:hidden"
        menuItems={mobileNavigation}
        buttonContent={<ProfileSummary user={user} />}
      />
    </>
  )
}

function SignedOutHeaders(props: { themeClasses?: string }) {
  const { themeClasses } = props

  return (
    <>
      <div
        className={clsx('text-base font-medium cursor-pointer', themeClasses)}
        onClick={firebaseLogin}
      >
        Sign in
      </div>
    </>
  )
}

export function Header(props: { darkBackground?: boolean; children?: any }) {
  const { darkBackground, children } = props

  const user = useUser()

  const themeClasses = clsx(darkBackground && 'text-white', hoverClasses)

  return (
    <nav
      className="max-w-7xl w-full flex flex-row justify-between md:justify-start pt-5 pb-4"
      aria-label="Global"
    >
      <Link href="/">
        <a className="flex flex-row gap-3">
          <img
            className="sm:h-10 sm:w-10 hover:rotate-12 transition-all"
            src="/logo-icon.svg"
            width={40}
            height={40}
          />
          <div
            className={clsx(
              'font-major-mono lowercase mt-1 sm:text-2xl',
              darkBackground && 'text-white'
            )}
          >
            Mantic Markets
          </div>
        </a>
      </Link>

      <Row
        className={clsx(
          'gap-8 mt-1',
          darkBackground ? 'md:ml-16' : 'md:ml-auto'
        )}
      >
        {children}

        {user ? (
          <SignedInHeaders user={user} themeClasses={themeClasses} />
        ) : (
          <SignedOutHeaders themeClasses={themeClasses} />
        )}
      </Row>
    </nav>
  )
}
