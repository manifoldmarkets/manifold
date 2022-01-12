import clsx from 'clsx'
import Link from 'next/link'

import { useUser } from '../hooks/use-user'
import { Row } from './layout/row'
import { firebaseLogin, User } from '../lib/firebase/users'
import { ManifoldLogo } from './manifold-logo'
import { ProfileMenu } from './profile-menu'

export function NavBar(props: {
  darkBackground?: boolean
  wide?: boolean
  isLandingPage?: boolean
  className?: string
  children?: any
}) {
  const { darkBackground, wide, isLandingPage, className, children } = props

  const user = useUser()

  const hoverClasses =
    'hover:underline hover:decoration-indigo-400 hover:decoration-2'
  const themeClasses = clsx(darkBackground && 'text-white', hoverClasses)

  return (
    <nav className={clsx('w-full p-4 mb-4', className)} aria-label="Global">
      <Row
        className={clsx(
          'justify-between items-center mx-auto sm:px-4',
          isLandingPage ? 'max-w-7xl' : wide ? 'max-w-6xl' : 'max-w-4xl'
        )}
      >
        <ManifoldLogo darkBackground={darkBackground} />

        <Row className="items-center gap-6 sm:gap-8 md:ml-16 lg:ml-40">
          {children}

          {!user && (
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
          )}

          {!isLandingPage && (
            <Link href="/markets">
              <a
                className={clsx(
                  'text-base hidden md:block whitespace-nowrap',
                  themeClasses
                )}
              >
                All markets
              </a>
            </Link>
          )}

          {user ? (
            <SignedInHeaders user={user} themeClasses={themeClasses} />
          ) : (
            <SignedOutHeaders themeClasses={themeClasses} />
          )}
        </Row>
      </Row>
    </nav>
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
