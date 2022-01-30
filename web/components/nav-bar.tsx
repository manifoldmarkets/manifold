import clsx from 'clsx'
import Link from 'next/link'

import { useUser } from '../hooks/use-user'
import { Row } from './layout/row'
import { firebaseLogin, User } from '../lib/firebase/users'
import { ManifoldLogo } from './manifold-logo'
import { ProfileMenu } from './profile-menu'
import {
  BellIcon,
  HomeIcon,
  SearchIcon,
  UserGroupIcon,
} from '@heroicons/react/outline'

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
    // <>
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
    // {/* <BottomNavBar /> */}
    // </>
  )
}

// From https://codepen.io/chris__sev/pen/QWGvYbL
// TODO: Show a line above the navbar
// TODO: Don't show when logged out
function BottomNavBar() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white z-20 flex justify-between text-xs text-gray-700">
      <Link href="/home">
        <a
          href="#"
          className="w-full block py-2 px-3 text-center hover:bg-blue-200 hover:text-blue-800 transition duration-300"
        >
          <HomeIcon className="h-6 w-6 my-1 mx-auto" aria-hidden="true" />
          {/* Home */}
        </a>
      </Link>

      <Link href="/markets">
        <a
          href="#"
          className="w-full block py-2 px-3 text-center hover:bg-blue-200 hover:text-blue-800"
        >
          <SearchIcon className="h-6 w-6 my-1 mx-auto" aria-hidden="true" />
          {/* Explore */}
        </a>
      </Link>

      <Link href="/folds">
        <a
          href="#"
          className="w-full block py-2 px-3 text-center hover:bg-blue-200 hover:text-blue-800"
        >
          <UserGroupIcon className="h-6 w-6 my-1 mx-auto" aria-hidden="true" />
          {/* Folds */}
        </a>
      </Link>

      <Link href="/home">
        <a
          href="#"
          className="w-full block py-2 px-3 text-center hover:bg-blue-200 hover:text-blue-800"
        >
          <BellIcon className="h-6 w-6 my-1 mx-auto" aria-hidden="true" />
          {/* Notifs */}
        </a>
      </Link>
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
