import Link from 'next/link'

import {
  HomeIcon,
  MenuAlt3Icon,
  PresentationChartLineIcon,
  SearchIcon,
  XIcon,
} from '@heroicons/react/outline'
import { Transition, Dialog } from '@headlessui/react'
import { useState, Fragment } from 'react'
import Sidebar, { Item } from './sidebar'
import { useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { Avatar } from '../avatar'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import NotificationsIcon from 'web/components/notifications-icon'

function getNavigation(username: string) {
  return [
    { name: 'Home', href: '/home', icon: HomeIcon },
    {
      name: 'Portfolio',
      href: `/${username}/bets`,
      icon: PresentationChartLineIcon,
    },
    {
      name: 'Notifications',
      href: `/notifications`,
      icon: NotificationsIcon,
    },
  ]
}

const signedOutNavigation = [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'Explore', href: '/markets', icon: SearchIcon },
]

// From https://codepen.io/chris__sev/pen/QWGvYbL
export function BottomNavBar() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const router = useRouter()
  const currentPage = router.pathname

  const user = useUser()

  const navigationOptions =
    user === null
      ? signedOutNavigation
      : getNavigation(user?.username || 'error')

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-between border-t-2 bg-white text-xs text-gray-700 lg:hidden">
      {navigationOptions.map((item) => (
        <NavBarItem key={item.name} item={item} currentPage={currentPage} />
      ))}
      <div
        className="w-full select-none py-1 px-3 text-center hover:cursor-pointer hover:bg-indigo-200 hover:text-indigo-700"
        onClick={() => setSidebarOpen(true)}
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

      <MobileSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
    </nav>
  )
}

function NavBarItem(props: { item: Item; currentPage: string }) {
  const { item, currentPage } = props

  return (
    <Link href={item.href}>
      <a
        className={clsx(
          'block w-full py-1 px-3 text-center hover:bg-indigo-200 hover:text-indigo-700',
          currentPage === item.href && 'bg-gray-200 text-indigo-700'
        )}
      >
        <item.icon className="my-1 mx-auto h-6 w-6" />
        {item.name}
      </a>
    </Link>
  )
}

// Sidebar that slides out on mobile
export function MobileSidebar(props: {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}) {
  const { sidebarOpen, setSidebarOpen } = props
  return (
    <div>
      <Transition.Root show={sidebarOpen} as={Fragment}>
        <Dialog
          as="div"
          className="fixed inset-0 z-40 flex"
          onClose={setSidebarOpen}
        >
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Dialog.Overlay className="fixed inset-0 bg-gray-600 bg-opacity-75" />
          </Transition.Child>
          <Transition.Child
            as={Fragment}
            enter="transition ease-in-out duration-300 transform"
            enterFrom="-translate-x-full"
            enterTo="translate-x-0"
            leave="transition ease-in-out duration-300 transform"
            leaveFrom="translate-x-0"
            leaveTo="-translate-x-full"
          >
            <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white pt-5 pb-4">
              <Transition.Child
                as={Fragment}
                enter="ease-in-out duration-300"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in-out duration-300"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <div className="absolute top-0 right-0 -mr-12 pt-2">
                  <button
                    type="button"
                    className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className="sr-only">Close sidebar</span>
                    <XIcon className="h-6 w-6 text-white" aria-hidden="true" />
                  </button>
                </div>
              </Transition.Child>
              <div className="mx-2 mt-5 h-0 flex-1 overflow-y-auto">
                <Sidebar className="pl-2" />
              </div>
            </div>
          </Transition.Child>
          <div className="w-14 flex-shrink-0" aria-hidden="true">
            {/* Dummy element to force sidebar to shrink to fit close icon */}
          </div>
        </Dialog>
      </Transition.Root>
    </div>
  )
}
