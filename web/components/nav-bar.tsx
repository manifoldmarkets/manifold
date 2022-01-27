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
  assertUser?: 'signed-in' | 'signed-out'
  className?: string
}) {
  const { darkBackground, wide, assertUser, className } = props

  const user = useUser()

  const hoverClasses =
    'hover:underline hover:decoration-indigo-400 hover:decoration-2'
  const themeClasses = clsx(darkBackground && 'text-white', hoverClasses)

  return (
    <nav className={clsx('w-full p-4 mb-4', className)} aria-label="Global">
      <Row
        className={clsx(
          'justify-between items-center mx-auto sm:px-4',
          wide ? 'max-w-6xl' : 'max-w-4xl'
        )}
      >
        <ManifoldLogo className="my-1" darkBackground={darkBackground} />

        <Row className="items-center gap-6 sm:gap-8 ml-6">
          {(user || user === null || assertUser) && (
            <NavOptions
              user={user}
              assertUser={assertUser}
              themeClasses={themeClasses}
            />
          )}
        </Row>
      </Row>
    </nav>
  )
}

function NavOptions(props: {
  user: User | null | undefined
  assertUser: 'signed-in' | 'signed-out' | undefined
  themeClasses: string
}) {
  const { user, assertUser, themeClasses } = props
  const showSignedIn = assertUser === 'signed-in' || !!user
  const showSignedOut =
    !showSignedIn && (assertUser === 'signed-out' || user === null)

  return (
    <>
      {showSignedOut && (
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

      <Link href="/folds">
        <a
          className={clsx(
            'text-base hidden md:block whitespace-nowrap',
            themeClasses
          )}
        >
          Folds
        </a>
      </Link>

      <Link href="/markets">
        <a
          className={clsx(
            'text-base hidden md:block whitespace-nowrap',
            themeClasses
          )}
        >
          Markets
        </a>
      </Link>

      {showSignedOut && (
        <>
          <button
            className="btn btn-sm btn-outline normal-case text-base font-medium px-6 bg-gradient-to-r"
            onClick={firebaseLogin}
          >
            Sign in
          </button>
        </>
      )}
      {showSignedIn && <ProfileMenu user={user ?? undefined} />}
    </>
  )
}
