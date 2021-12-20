import clsx from 'clsx'
import Link from 'next/link'

import { useUser } from '../hooks/use-user'
import { Row } from './layout/row'
import { firebaseLogin, User } from '../lib/firebase/users'
import { ManticLogo } from './mantic-logo'
import { ProfileMenu } from './profile-menu'

const hoverClasses =
  'hover:underline hover:decoration-indigo-400 hover:decoration-2'

export function NavBar(props: {
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
        'w-full flex flex-row justify-between md:justify-start pt-5 pb-4',
        className
      )}
      aria-label="Global"
    >
      <ManticLogo darkBackground={darkBackground} />

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

      <ProfileMenu user={user} />
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
