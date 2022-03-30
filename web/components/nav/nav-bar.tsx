import clsx from 'clsx'
import Link from 'next/link'

import { useUser } from '../../hooks/use-user'
import { firebaseLogin, User } from '../../lib/firebase/users'
import {
  CollectionIcon,
  HomeIcon,
  SearchIcon,
  UserGroupIcon,
} from '@heroicons/react/outline'

// From https://codepen.io/chris__sev/pen/QWGvYbL
export function BottomNavBar() {
  const user = useUser()
  if (!user) {
    return null
  }
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-between border-t-2 bg-white text-xs text-gray-700 md:hidden">
      <Link href="/home">
        <a
          href="#"
          className="block w-full py-2 px-3 text-center transition duration-300 hover:bg-indigo-200 hover:text-indigo-700"
        >
          <HomeIcon className="my-1 mx-auto h-6 w-6" aria-hidden="true" />
          {/* Home */}
        </a>
      </Link>

      <Link href="/markets">
        <a
          href="#"
          className="block w-full py-2 px-3 text-center hover:bg-indigo-200 hover:text-indigo-700"
        >
          <SearchIcon className="my-1 mx-auto h-6 w-6" aria-hidden="true" />
          {/* Explore */}
        </a>
      </Link>

      <Link href="/folds">
        <a
          href="#"
          className="block w-full py-2 px-3 text-center hover:bg-indigo-200 hover:text-indigo-700"
        >
          <UserGroupIcon className="my-1 mx-auto h-6 w-6" aria-hidden="true" />
          {/* Folds */}
        </a>
      </Link>

      {/* TODO: replace with a link to your own profile */}
      <Link href="/trades">
        <a
          href="#"
          className="block w-full py-2 px-3 text-center hover:bg-indigo-200 hover:text-indigo-700"
        >
          <CollectionIcon className="my-1 mx-auto h-6 w-6" aria-hidden="true" />
          {/* Your Trades */}
        </a>
      </Link>
    </nav>
  )
}

export function NavOptions(props: {
  user: User | null | undefined
  assertUser?: 'signed-in' | 'signed-out'
  themeClasses?: string
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
              'hidden whitespace-nowrap text-base md:block',
              themeClasses
            )}
          >
            About
          </a>
        </Link>
      )}

      {showSignedOut && (
        <>
          <button
            className="btn btn-sm btn-outline bg-gradient-to-r px-6 text-base font-medium normal-case"
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
