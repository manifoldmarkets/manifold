import Link from 'next/link'

import {
  HomeIcon,
  MenuAlt3Icon,
  XIcon,
  SearchIcon,
} from '@heroicons/react/outline'
import { DeviceMobileIcon, ScaleIcon, UserCircleIcon } from '@heroicons/react/solid'
import { Transition, Dialog } from '@headlessui/react'
import { useState, Fragment, useEffect } from 'react'
import Sidebar from './sidebar'
import { Item } from './sidebar-item'
import { useUser } from 'web/hooks/use-user'
import { formatMoney } from 'common/util/format'
import { Avatar } from '../widgets/avatar'
import clsx from 'clsx'
import { useRouter } from 'next/router'
import NotificationsIcon from 'web/components/notifications-icon'
import { useIsIframe } from 'web/hooks/use-is-iframe'
import { trackCallback } from 'web/lib/service/analytics'
import { User } from 'common/user'
import { Col } from '../layout/col'
import { firebaseLogin } from 'web/lib/firebase/users'
import { isIOS } from 'web/lib/util/device'
import { APPLE_APP_URL, GOOGLE_PLAY_APP_URL } from 'common/envs/constants'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { animated } from '@react-spring/web'

export const BOTTOM_NAV_BAR_HEIGHT = 58

const itemClass =
  'sm:hover:bg-ink-200 block w-full py-1 px-3 text-center sm:hover:text-primary-700 transition-colors'
const selectedItemClass = 'bg-ink-100 text-primary-700'
const touchItemClass = 'bg-primary-100'

function getNavigation(user: User) {
  return [
    { name: 'Home', href: '/home', icon: HomeIcon },
    { name: 'Search', href: '/find', icon: SearchIcon },
    {
      name: 'Profile',
      href: `/${user.username}`,
    },
    {
      name: 'Notifs',
      href: `/notifications`,
      icon: NotificationsIcon,
    },
  ]
}

const signedOutNavigation = (appStoreUrl: string) => [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'Markets', href: '/markets', icon: ScaleIcon },
  {
    name: 'Get app',
    href: appStoreUrl,
    icon: DeviceMobileIcon,
  },
  { name: 'Sign in', onClick: firebaseLogin, icon: UserCircleIcon },
]

// From https://codepen.io/chris__sev/pen/QWGvYbL
export function BottomNavBar() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const router = useRouter()
  const currentPage = router.pathname

  const user = useUser()

  const [appStoreUrl, setAppStoreUrl] = useState(APPLE_APP_URL)
  useEffect(() => {
    setAppStoreUrl(isIOS() ? APPLE_APP_URL : GOOGLE_PLAY_APP_URL)
  }, [])

  const isIframe = useIsIframe()
  if (isIframe) {
    return null
  }

  const navigationOptions = user
    ? getNavigation(user)
    : signedOutNavigation(appStoreUrl)

  return (
    <nav className="border-ink-200 text-ink-700 bg-canvas-0 fixed inset-x-0 bottom-0 z-50 flex select-none items-center justify-between border-t-2 text-xs lg:hidden">
      {navigationOptions.map((item) => (
        <NavBarItem
          key={item.name}
          item={item}
          currentPage={currentPage}
          user={user}
        />
      ))}
      {!!user && (
        <>
          <div
            className={clsx(itemClass, sidebarOpen ? selectedItemClass : '')}
            onClick={() => setSidebarOpen(true)}
          >
            <MenuAlt3Icon
              className=" my-1 mx-auto h-6 w-6"
              aria-hidden="true"
            />
            More
          </div>
          <MobileSidebar
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />
        </>
      )}
    </nav>
  )
}

function NavBarItem(props: {
  item: Item
  currentPage: string
  children?: any
  user?: User | null
  className?: string
}) {
  const { item, currentPage, children, user } = props
  const track = trackCallback(`navbar: ${item.trackingEventName ?? item.name}`)
  const [touched, setTouched] = useState(false)
  const balance = useAnimatedNumber(user?.balance ?? 0)
  if (item.name === 'Profile' && user) {
    return (
      <Link
        href={item.href ?? '#'}
        className={clsx(
          itemClass,
          touched && touchItemClass,
          currentPage === '/[username]' && selectedItemClass
        )}
        onClick={track}
        onTouchStart={() => setTouched(true)}
        onTouchEnd={() => setTouched(false)}
      >
        <Col>
          <div className="mx-auto my-1">
            <Avatar
              className="h-6 w-6"
              username={user.username}
              avatarUrl={user.avatarUrl}
              noLink
            />
          </div>
          <animated.div>{balance.to((b) => formatMoney(b))}</animated.div>
        </Col>
      </Link>
    )
  }

  if (!item.href) {
    return (
      <button
        className={clsx(itemClass, touched && touchItemClass)}
        onClick={() => {
          track()
          item.onClick?.()
        }}
        onTouchStart={() => setTouched(true)}
        onTouchEnd={() => setTouched(false)}
      >
        {item.icon && <item.icon className="my-1 mx-auto h-6 w-6" />}
        {children}
        {item.name}
      </button>
    )
  }

  return (
    <Link
      href={item.href}
      className={clsx(
        itemClass,
        touched && touchItemClass,
        currentPage === item.href && selectedItemClass
      )}
      onClick={track}
      onTouchStart={() => setTouched(true)}
      onTouchEnd={() => setTouched(false)}
    >
      {item.icon && <item.icon className="my-1 mx-auto h-6 w-6" />}
      {children}
      {item.name}
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
          className="fixed inset-0 z-50 flex"
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
            <Dialog.Overlay className="bg-ink-600 fixed inset-0 bg-opacity-75" />
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
            <div className="bg-canvas-0 relative flex w-full max-w-xs flex-1 flex-col">
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
                    className="focus:ring-ink-0ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className="sr-only">Close sidebar</span>
                    <XIcon className="text-ink-0 h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
              </Transition.Child>
              <div className="mx-2 h-0 flex-1 overflow-y-auto">
                <Sidebar className="pl-2" isMobile />
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
