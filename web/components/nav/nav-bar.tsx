import Link from 'next/link'

import {
  HomeIcon,
  MenuAlt3Icon,
  PresentationChartLineIcon,
  SearchIcon,
} from '@heroicons/react/outline'
import { useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { Avatar } from '../avatar'

// From https://codepen.io/chris__sev/pen/QWGvYbL
export function BottomNavBar(props: { toggleSidebar: () => void }) {
  const { toggleSidebar } = props

  const user = useUser()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-between border-t-2 bg-white text-xs text-gray-700 lg:hidden">
      <Link href={user ? '/home' : '/'}>
        <a className="block w-full py-1 px-3 text-center transition duration-300 hover:bg-indigo-200 hover:text-indigo-700">
          <HomeIcon className="my-1 mx-auto h-6 w-6" aria-hidden="true" />
          Home
        </a>
      </Link>

      <Link href="/markets">
        <a className="block w-full py-1 px-3 text-center hover:bg-indigo-200 hover:text-indigo-700">
          <SearchIcon className="my-1 mx-auto h-6 w-6" aria-hidden="true" />
          Explore
        </a>
      </Link>

      {user !== null && (
        <Link href="/portfolio">
          <a className="block w-full py-1 px-3 text-center hover:bg-indigo-200 hover:text-indigo-700">
            <PresentationChartLineIcon
              className="my-1 mx-auto h-6 w-6"
              aria-hidden="true"
            />
            Portfolio
          </a>
        </Link>
      )}

      <div
        className="w-full select-none py-1 px-3 text-center hover:cursor-pointer hover:bg-indigo-200 hover:text-indigo-700"
        onClick={() => toggleSidebar()}
      >
        {user === null ? (
          <>
            <MenuAlt3Icon className="my-1 mx-auto h-6 w-6" aria-hidden="true" />
            More
          </>
        ) : user ? (
          <>
            <Avatar
              className="mx-auto my-1"
              size="xs"
              username={user.username}
              avatarUrl={user.avatarUrl}
              noLink
            />
            {formatMoney(user.balance)}
          </>
        ) : (
          <></>
        )}
      </div>
    </nav>
  )
}
