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
      name: 'Your bets',
      href: '/bets',
    },
    {
      name: 'Your markets',
      href: `/${user.username}`,
    },
    {
      name: 'Add funds',
      href: '/add-funds',
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
      <Link href="/about">
        <a
          className={clsx(
            'text-base hidden md:block whitespace-nowrap',
            themeClasses
          )}
        >
          About
        </a>
      </Link>

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

function SignedOutHeaders(props: { themeClasses?: string }) {
  const { themeClasses } = props

  return (
    <>
      <div
        className={clsx(
          'text-base font-medium cursor-pointer whitespace-nowrap',
          themeClasses
        )}
        onClick={firebaseLogin}
      >
        Sign in
      </div>
    </>
  )
}

export function Header(props: {
  darkBackground?: boolean
  className?: string
  children?: any
}) {
  const { darkBackground, className, children } = props

  const user = useUser()

  const themeClasses = clsx(darkBackground && 'text-white', hoverClasses)

  return (
    <nav
      className={clsx(
        'max-w-7xl w-full flex flex-row justify-between md:justify-start pt-5 pb-4',
        className
      )}
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
              'font-major-mono lowercase mt-1 sm:text-2xl md:whitespace-nowrap',
              darkBackground && 'text-white'
            )}
          >
            Mantic Markets
          </div>
        </a>
      </Link>

      <Row className="gap-6 sm:gap-8 mt-1 md:ml-16">
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
