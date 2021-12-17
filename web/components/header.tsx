import clsx from 'clsx'
import Link from 'next/link'
import Image from 'next/Image'

import { useUser } from '../hooks/use-user'
import { formatMoney } from '../lib/util/format'
import { Row } from './layout/row'
import { User } from '../lib/firebase/users'

const hoverClasses =
  'hover:underline hover:decoration-indigo-400 hover:decoration-2'

function SignedInHeaders(props: { user: User; themeClasses?: string }) {
  const { user, themeClasses } = props

  return (
    <>
      <Link href="/create">
        <a className={clsx('text-base font-medium', themeClasses)}>
          Create a market
        </a>
      </Link>

      <Link href="/bets">
        <a className={clsx('text-base font-medium', themeClasses)}>Your bets</a>
      </Link>

      <Link href="/account">
        <a className={clsx('text-base font-medium', themeClasses)}>
          <Row className="avatar items-center">
            <div className="rounded-full w-10 h-10 mr-4">
              <Image src={user.avatarUrl} width={40} height={40} />
            </div>
            <div>
              {user.name}
              <div className="text-gray-700 text-sm">
                {formatMoney(user.balance)}
              </div>
            </div>
          </Row>
        </a>
      </Link>
    </>
  )
}

function SignedOutHeaders(props: { themeClasses?: string }) {
  const { themeClasses } = props

  return (
    <>
      <div className={clsx('text-base font-medium', themeClasses)}>Sign in</div>
    </>
  )
}

export function Header(props: { darkBackground?: boolean; children?: any }) {
  const { darkBackground, children } = props

  const user = useUser()

  const themeClasses = clsx(darkBackground && 'text-white', hoverClasses)

  return (
    <nav
      className="max-w-7xl w-full flex flex-row mx-auto pt-5 px-4 sm:px-6"
      aria-label="Global"
    >
      <Link href="/">
        <a className="flex flex-row gap-3">
          <Image
            className="h-6 w-6 sm:h-10 sm:w-10 hover:rotate-12 transition-all"
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

      <Row className="gap-8 mt-1 md:ml-16 mr-8">
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
